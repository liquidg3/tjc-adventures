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
import type { ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const ASSET_MAP_FILE = resolve(here, "asset-map.json");
const VERTICAL_DEFAULTS_FILE = resolve(here, "vertical-defaults.json");
const ASSET_NORMALIZATION_PRESETS_FILE = resolve(here, "asset-normalization-presets.json");
const ASSET_NORMALIZATION_OVERRIDES_FILE = resolve(here, "asset-normalization-overrides.json");
const LEVEL_BUILDER_FILE = resolve(here, "level-builder.json");
const UI_THEME_FILE = resolve(here, "ui-theme.json");

// Factory for the Studio's dev-only "JSON-mirror" endpoints: each one mirrors
// a single committed JSON file (durable + version-controlled), instead of using
// fragile browser localStorage. Every config surface in the Studio (asset map,
// normalization presets/overrides, vertical-scroller defaults, level builder)
// rides this same shape:
//   GET  <route>  → current file contents (or "{}" if absent)
//   POST <route>  → overwrite the file with the request body
function jsonFilePlugin(
  name: string,
  route: string,
  file: string,
  onWrite?: (file: string) => void,
): Plugin {
  return {
    name: `tjc-${name}`,
    configureServer(server) {
      server.middlewares.use(route, (req, res) => {
        if (req.method === "GET") {
          const data = existsSync(file) ? readFileSync(file, "utf8") : "{}";
          res.setHeader("content-type", "application/json");
          res.end(data);
          return;
        }
        if (req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            try {
              writeFileSync(file, body || "{}");
              onWrite?.(file);
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

// Repo root is two levels up from apps/studio
const REPO_ROOT = resolve(here, "../..");

function gitAutoCommit(file: string, message: string) {
  try {
    const rel = file.replace(REPO_ROOT + "/", "");
    execFileSync("git", ["add", rel], { cwd: REPO_ROOT });
    execFileSync("git", ["commit", "--no-verify", "-m", message], { cwd: REPO_ROOT, stdio: "pipe" });
    console.log(`[studio] auto-committed: ${rel}`);
  } catch {
    // Nothing to commit (file unchanged) — that's fine, swallow silently
  }
}

// Live Kenney catalog: the dev server scrapes kenney.nl (no browser CORS) so the
// Asset Library can show every CC0 3D + UI pack with a real preview image + a
// working download link. Results are cached in memory for the session.
//   GET /__kenney/list            → [{ slug, name, kind }] for 3D + UI packs
//   GET /__kenney/meta?slug=NAME  → { preview, zip } for one pack
//   POST /__kenney/import?slug=NAME&kind=3d|ui → stage it into public/{models,ui}
type KenneyKind = "3d" | "ui";
const KENNEY = "https://kenney.nl";
const metaCache = new Map<string, { preview: string; zip: string }>();
const listCacheByKind: Partial<Record<KenneyKind, Array<{ slug: string; name: string; kind: KenneyKind }>>> = {};

async function kenneyFetch(url: string): Promise<string> {
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (tjc-studio)" } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

// Walk every page of a Kenney /assets/<filter> listing until a page yields no
// new slugs. Kenney paginates via /page:N. DENY filters nav/filter links.
async function scrapeKenneyList(filter: string, kind: KenneyKind) {
  if (listCacheByKind[kind]) return listCacheByKind[kind]!;
  const DENY = new Set(["category", "tag", "series", "license", "search", "assets", "page"]);
  const slugs = new Set<string>();
  for (let page = 1; page <= 15; page++) {
    let html: string;
    try {
      html = await kenneyFetch(`${KENNEY}/assets/${filter}/page:${page}`);
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
  listCacheByKind[kind] = [...slugs].sort().map((slug) => ({
    slug,
    name: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    kind,
  }));
  return listCacheByKind[kind]!;
}

async function kenneyList() {
  const [d3, ui] = await Promise.all([
    scrapeKenneyList("category:3D", "3d"),
    // Kenney's tag system uses "interface" for UI packs; tag:UI returns nothing.
    scrapeKenneyList("tag:interface", "ui"),
  ]);
  // Dedupe across the two lists; if a slug appears in both, prefer the UI tag
  // (more specific). Sort by display name.
  const byKind = new Map<string, { slug: string; name: string; kind: KenneyKind }>();
  for (const pack of [...d3, ...ui]) byKind.set(pack.slug, pack);
  return [...byKind.values()].sort((a, b) => a.name.localeCompare(b.name));
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

// Download a Kenney UI pack's zip, unzip it, and stage its 2D assets into
// committed public/ui/kenney-<slug>. We keep the pack's internal directory
// layout (Kenney UI packs typically nest into PNG/Default/, PNG/Double/,
// Vector/, …) and write a flat manifest mapping logical names → file paths.
async function kenneyImportUI(slug: string) {
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
  const uiRoot = resolve(here, "public/ui");
  const out = join(uiRoot, pack);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  // Pack PNGs/SVGs/JPGs are the UI assets; skip Kenney's top-level Preview/
  // marketing PNGs (they live one or two levels deep but always have
  // "preview"/"sample"/"thumbnail" in the name).
  const all = walkFiles(unz);
  const lower = (f: string) => f.toLowerCase();
  const SKIP_NAME = /(?:preview|sample|screenshot|thumbnail|kenney-banner)/i;
  const sourceFiles = all.filter((f) => /\.(png|svg|jpg|jpeg)$/i.test(lower(f)) && !SKIP_NAME.test(basename(f)));

  // Strip the unzip dir prefix and an optional top-level kenney_… folder; keep
  // the rest of the path so PNG/Default/button_red.png stays grouped.
  const items: Array<{ name: string; file: string }> = [];
  for (const sp of sourceFiles) {
    let rel = sp.slice(unz.length + 1);
    const parts = rel.split(/[/\\]/);
    if (parts[0] && /^(?:kenney[_-]|Kenney)/.test(parts[0])) rel = parts.slice(1).join("/");
    const destAbs = join(out, rel);
    mkdirSync(dirname(destAbs), { recursive: true });
    try {
      copyFileSync(sp, destAbs);
      items.push({ name: rel.replace(/\.[^.]+$/, ""), file: rel });
    } catch {
      /* skip a bad asset */
    }
  }

  items.sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(
    join(out, "manifest.json"),
    JSON.stringify({ pack, kind: "ui", items }, null, 2),
  );

  const indexPath = join(uiRoot, "index.json");
  const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : { packs: [] };
  if (!index.packs.includes(pack)) index.packs.push(pack);
  writeFileSync(indexPath, JSON.stringify(index, null, 2));

  rmSync(tmp, { recursive: true, force: true });
  return { pack, count: items.length, kind: "ui" };
}

function kenneyPlugin(): Plugin {
  const json = (res: ServerResponse, data: unknown, code = 200) => {
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
          const u = new URL(req.url ?? "", "http://x");
          const slug = u.searchParams.get("slug") ?? "";
          const kind = (u.searchParams.get("kind") ?? "3d") as KenneyKind;
          if (!slug) return json(res, { error: "no slug" }, 400);
          json(res, kind === "ui" ? await kenneyImportUI(slug) : await kenneyImport(slug));
        } catch (e) {
          json(res, { error: String(e) }, 502);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    jsonFilePlugin("asset-map", "/__asset-map", ASSET_MAP_FILE),
    jsonFilePlugin("vertical-defaults", "/__vertical-defaults", VERTICAL_DEFAULTS_FILE),
    jsonFilePlugin("asset-normalization-presets", "/__asset-normalization-presets", ASSET_NORMALIZATION_PRESETS_FILE),
    jsonFilePlugin("asset-normalization-overrides", "/__asset-normalization-overrides", ASSET_NORMALIZATION_OVERRIDES_FILE),
    jsonFilePlugin("level-builder", "/__level-builder", LEVEL_BUILDER_FILE),
    jsonFilePlugin("ui-theme", "/__ui-theme", UI_THEME_FILE, (f) =>
      gitAutoCommit(f, "chore(studio): auto-save ui-theme.json")),
    kenneyPlugin(),
  ],
  server: {
    host: true,
    port: 5174, // distinct from the game client (5173) so both can run
    strictPort: true,
    open: true,
  },
});
