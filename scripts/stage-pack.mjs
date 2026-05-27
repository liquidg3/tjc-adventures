// Stage a local "ready GLB" pack into committed apps/studio/public/models so the
// Asset Test screen + 3D Models board can use it. This is the MANUAL path; the
// Asset Library's one-click Import (vite.config kenneyPlugin) does the same thing
// for Kenney packs over the network. Kenney ships clean GLBs with embedded textures
// and sane Y-up orientation, so there's nothing to repoint — we copy the GLBs (or
// assimp-convert OBJ/FBX if a pack only ships those) and write a manifest.
//
// Usage:  node scripts/stage-pack.mjs <sourceDir> <packName>
//   e.g.  node scripts/stage-pack.mjs ~/Downloads/kenney_some-kit kenney-some-kit
//
// Only stage CC0-licensed packs — public/models is committed.

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  readFileSync,
  copyFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join, basename, extname } from "node:path";

const SRC = process.argv[2];
const PACK = process.argv[3] || "pack";
if (!SRC || !existsSync(SRC)) {
  console.error("usage: node scripts/stage-pack.mjs <sourceDir> <packName>");
  process.exit(1);
}
const TEST_ROOT = join(process.cwd(), "apps/studio/public/models");
const OUT = join(TEST_ROOT, PACK);

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const ext = (f) => extname(f).toLowerCase();

const all = walk(SRC);
const glbs = all.filter((f) => ext(f) === ".glb");
const objs = all.filter((f) => ext(f) === ".obj");
const fbxs = all.filter((f) => ext(f) === ".fbx");
const texs = all.filter(
  (f) => [".png", ".jpg", ".jpeg"].includes(ext(f)) && !/preview|thumb|icon/i.test(f),
);

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// copy textures too, in case a glb/obj references them by relative path
for (const t of texs) {
  try {
    copyFileSync(t, join(OUT, basename(t)));
  } catch {
    /* ignore dup names */
  }
}

// prefer ready GLBs; fall back to converting OBJ, then FBX
const source = glbs.length ? glbs : objs.length ? objs : fbxs;
const convert = glbs.length === 0;
const fmt = glbs.length ? "glb-copy" : objs.length ? "obj-convert" : "fbx-convert";

const manifest = [];
const seen = new Set();
let ok = 0;
let failed = 0;
for (const srcPath of source) {
  const base = basename(srcPath, ext(srcPath));
  let name = base;
  let i = 2;
  while (seen.has(name)) name = `${base}_${i++}`;
  seen.add(name);
  const out = join(OUT, `${name}.glb`);
  try {
    if (convert) execFileSync("assimp", ["export", srcPath, out, "glb2"], { stdio: "ignore" });
    else copyFileSync(srcPath, out);
    manifest.push({ name, file: `${name}.glb`, atlas: "" }); // textures embedded → no atlas
    ok++;
  } catch {
    console.warn(`skip   ${basename(srcPath)}`);
    failed++;
  }
}

manifest.sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(join(OUT, "manifest.json"), JSON.stringify({ pack: PACK, models: manifest }, null, 2));

const indexPath = join(TEST_ROOT, "index.json");
const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : { packs: [] };
if (!index.packs.includes(PACK)) index.packs.push(PACK);
writeFileSync(indexPath, JSON.stringify(index, null, 2));

console.log(`\n${PACK}: ${ok} models -> ${OUT}  (${failed} failed, ${fmt})`);
