import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readdirSync,
  statSync,
  copyFileSync,
} from "node:fs";
import { dirname, resolve, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const ASSET_MAP_FILE = resolve(here, "asset-map.json");
const VERTICAL_DEFAULTS_FILE = resolve(here, "vertical-defaults.json");

// Dev-only endpoint that persists Studio assignments to a committed JSON file
// (durable + version-controlled), instead of fragile browser localStorage.
//   GET  /__asset-map  → current asset-map.json
//   POST /__asset-map  → overwrite it with the request body
function assetMapPlugin(): Plugin {
  return {
    name: "tjc-asset-map",
    configureServer(server) {
      server.middlewares.use("/__asset-map", (req, res) => {
        if (req.method === "GET") {
          const data = existsSync(ASSET_MAP_FILE) ? readFileSync(ASSET_MAP_FILE, "utf8") : "{}";
          res.setHeader("content-type", "application/json");
          res.end(data);
          return;
        }
        if (req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            try {
              writeFileSync(ASSET_MAP_FILE, body || "{}");
              res.end("ok");
            } catch (err) {
              res.statusCode = 500;
              res.end(String(err));
            }
          });
          return;
        }
        res.statusCode = 405;
        res.end();
      });
    },
  };
}

function verticalDefaultsPlugin(): Plugin {
  return {
    name: "tjc-vertical-defaults",
    configureServer(server) {
      server.middlewares.use("/__vertical-defaults", (req, res) => {
        if (req.method === "GET") {
          const data = existsSync(VERTICAL_DEFAULTS_FILE)
            ? readFileSync(VERTICAL_DEFAULTS_FILE, "utf8")
            : "{}";
          res.setHeader("content-type", "application/json");
          res.end(data);
          return;
        }
        if (req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            try {
              writeFileSync(VERTICAL_DEFAULTS_FILE, body || "{}");
              res.end("ok");
            } catch (err) {
              res.statusCode = 500;
              res.end(String(err));
            }
          });
          return;
        }
        res.statusCode = 405;
        res.end();
      });
    },
  };
}

// Live Kenney catalog: the dev server scrapes kenney.nl (no browser CORS) so the
// Asset Library can show every CC0 3D pack with a real preview image + a working
// download link. Results are cached in memory for the session.
//   GET /__kenney/list            → [{ slug, name }] for all 3D packs
//   GET /__kenney/meta?slug=NAME  → { preview, zip } for one pack
const KENNEY = "https://kenney.nl";
const metaCache = new Map<string, { preview: string; zip: string }>();
let listCache: Array<{ slug: string; name: string }> | null = null;

async function kenneyFetch(url: string): Promise<string> {
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (tjc-studio)" } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

async function kenneyList() {
  if (listCache) return listCache;
  // nav/filter links to skip
  const DENY = new Set(["category", "tag", "series", "license", "search", "assets", "page"]);
  // walk every page of the 3D category (Kenney paginates via /page:N) until a
  // page yields no new slugs
  const slugs = new Set<string>();
  for (let page = 1; page <= 15; page++) {
    let html: string;
    try {
      html = await kenneyFetch(`${KENNEY}/assets/category:3D/page:${page}`);
    } catch {
      break;
    }
    const before = slugs.size;
    for (const m of html.matchAll(/\/assets\/([a-z0-9][a-z0-9-]+)/g)) {
      if (!DENY.has(m[1])) slugs.add(m[1]);
    }
    if (slugs.size === before) break; // empty page → end of list
    await new Promise((r) => setTimeout(r, 150)); // be polite to kenney.nl
  }
  listCache = [...slugs].sort().map((slug) => ({
    slug,
    name: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  }));
  return listCache;
}

async function kenneyMeta(slug: string) {
  const cached = metaCache.get(slug);
  if (cached) return cached;
  const html = await kenneyFetch(`${KENNEY}/assets/${slug}`);
  const base = `https://kenney\\.nl/media/pages/assets/${slug}/[^"'\\s)]+`;
  const zip = html.match(new RegExp(`${base}\\.zip`))?.[0] ?? "";
  const preview =
    html.match(new RegExp(`${base}preview[^"'\\s)]*\\.png`))?.[0] ??
    html.match(new RegExp(`${base}\\.(?:png|jpg)`))?.[0] ??
    "";
  const meta = { preview, zip };
  metaCache.set(slug, meta);
  return meta;
}

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
  return out;
}

/** External (non-embedded) image filenames a GLB references, if any. */
function glbImageUris(glbPath: string): string[] {
  const b = readFileSync(glbPath);
  if (b.length < 20 || b.readUInt32LE(0) !== 0x46546c67) return [];
  const j = JSON.parse(b.toString("utf8", 20, 20 + b.readUInt32LE(12)));
  return ((j.images ?? []) as Array<{ uri?: string }>)
    .map((i) => i.uri)
    .filter((u): u is string => !!u && !u.startsWith("data:"));
}

// Download a Kenney pack's zip, unzip it, and stage its models into committed
// public/models/kenney-<slug> so it shows up in Asset Test + the 3D Models board —
// one click, no ~/Downloads round-trip. Kenney ships ready GLBs (just copy);
// OBJ/FBX-only packs get assimp-converted. Paths resolve from this file, not cwd.
async function kenneyImport(slug: string) {
  const meta = await kenneyMeta(slug);
  if (!meta.zip) throw new Error("no zip url for " + slug);
  const tmp = join(tmpdir(), "tjc-kenney", slug);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const zipPath = join(tmp, "pack.zip");
  const ab = await (await fetch(meta.zip, { headers: { "user-agent": "Mozilla/5.0 (tjc-studio)" } })).arrayBuffer();
  writeFileSync(zipPath, Buffer.from(ab));
  const unz = join(tmp, "unz");
  mkdirSync(unz, { recursive: true });
  execFileSync("unzip", ["-o", "-q", zipPath, "-d", unz]);

  const pack = `kenney-${slug}`;
  const modelsRoot = resolve(here, "public/models");
  const out = join(modelsRoot, pack);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  const all = walkFiles(unz);
  const lower = (f: string) => f.toLowerCase();
  const glbs = all.filter((f) => lower(f).endsWith(".glb"));
  const objs = all.filter((f) => lower(f).endsWith(".obj"));
  const fbxs = all.filter((f) => lower(f).endsWith(".fbx"));
  const source = glbs.length ? glbs : objs.length ? objs : fbxs;
  const convert = glbs.length === 0;
  const models: Array<{ name: string; file: string; atlas: string }> = [];
  const seen = new Set<string>();
  for (const sp of source) {
    const b = basename(sp).replace(/\.[^.]+$/, "");
    let n = b;
    let i = 2;
    while (seen.has(n)) n = `${b}_${i++}`;
    seen.add(n);
    const dest = join(out, `${n}.glb`);
    try {
      if (convert) execFileSync("assimp", ["export", sp, dest, "glb2"], { stdio: "ignore" });
      else copyFileSync(sp, dest);
      models.push({ name: n, file: `${n}.glb`, atlas: "" });
    } catch {
      /* skip a bad model */
    }
  }
  // copy only textures the staged GLBs actually reference — skips Kenney's
  // hundreds of preview-angle PNGs (vertex-colored GLBs reference none)
  const neededTex = new Set<string>();
  for (const m of models) for (const uri of glbImageUris(join(out, m.file))) neededTex.add(basename(uri));
  for (const name of neededTex) {
    const src = all.find((f) => basename(f) === name);
    if (src) {
      try {
        copyFileSync(src, join(out, name));
      } catch {
        /* ignore */
      }
    }
  }

  models.sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(join(out, "manifest.json"), JSON.stringify({ pack, models }, null, 2));

  const indexPath = join(modelsRoot, "index.json");
  const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : { packs: [] };
  if (!index.packs.includes(pack)) index.packs.push(pack);
  writeFileSync(indexPath, JSON.stringify(index, null, 2));

  rmSync(tmp, { recursive: true, force: true });
  return { pack, count: models.length, format: convert ? "converted" : "glb" };
}

function kenneyPlugin(): Plugin {
  const json = (res: import("node:http").ServerResponse, data: unknown, code = 200) => {
    res.statusCode = code;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(data));
  };
  return {
    name: "tjc-kenney",
    configureServer(server) {
      server.middlewares.use("/__kenney/list", async (_req, res) => {
        try {
          json(res, { packs: await kenneyList() });
        } catch (e) {
          json(res, { error: String(e) }, 502);
        }
      });
      server.middlewares.use("/__kenney/meta", async (req, res) => {
        try {
          const slug = new URL(req.url ?? "", "http://x").searchParams.get("slug") ?? "";
          if (!slug) return json(res, { error: "no slug" }, 400);
          json(res, await kenneyMeta(slug));
        } catch (e) {
          json(res, { error: String(e) }, 502);
        }
      });
      server.middlewares.use("/__kenney/import", async (req, res) => {
        if (req.method !== "POST") return json(res, { error: "POST only" }, 405);
        try {
          const slug = new URL(req.url ?? "", "http://x").searchParams.get("slug") ?? "";
          if (!slug) return json(res, { error: "no slug" }, 400);
          json(res, await kenneyImport(slug));
        } catch (e) {
          json(res, { error: String(e) }, 502);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), assetMapPlugin(), verticalDefaultsPlugin(), kenneyPlugin()],
  server: {
    host: true,
    port: 5174, // distinct from the game client (5173) so both can run
    strictPort: true,
    open: true,
  },
});
