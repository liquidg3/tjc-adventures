// Pull 3D models from a source dir (default ~/Downloads), convert them to GLB,
// and drop them into the Design Studio (apps/designs/src/models/) where the
// gallery auto-discovers them.
//
//   node scripts/convert-models.mjs [sourceDir]
//
// Needs `assimp` for non-glb formats:  brew install assimp
import { execFileSync } from "node:child_process";
import { readdirSync, mkdirSync, copyFileSync, statSync, existsSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { homedir } from "node:os";

const srcDir = process.argv[2] || join(homedir(), "Downloads");
const destDir = join(process.cwd(), "apps/studio/src/models");

const COPY = new Set([".glb"]);
const CONVERT = new Set([".gltf", ".fbx", ".obj", ".stl", ".dae", ".ply", ".3ds"]);
const NEEDS_APP = new Set([".blend", ".max", ".usdz", ".c4d", ".ma", ".mb"]);

function hasAssimp() {
  try {
    execFileSync("assimp", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

if (!existsSync(srcDir)) {
  console.error(`Source dir not found: ${srcDir}`);
  process.exit(1);
}
mkdirSync(destDir, { recursive: true });

const assimp = hasAssimp();
const slug = (n) => n.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();

let converted = 0,
  copied = 0,
  skipped = 0;

for (const file of readdirSync(srcDir)) {
  const full = join(srcDir, file);
  if (!statSync(full).isFile()) continue;
  const ext = extname(file).toLowerCase();
  const out = join(destDir, `${slug(basename(file, ext))}.glb`);

  if (COPY.has(ext)) {
    copyFileSync(full, out);
    copied++;
    console.log(`copy     ${file}`);
  } else if (CONVERT.has(ext)) {
    if (!assimp) {
      console.warn(`skip     ${file}  (install assimp: brew install assimp)`);
      skipped++;
      continue;
    }
    try {
      execFileSync("assimp", ["export", full, out, "glb2"], { stdio: "ignore" });
      converted++;
      console.log(`convert  ${file}  →  ${basename(out)}`);
    } catch (err) {
      console.error(`FAIL     ${file}  (${err.message})`);
      skipped++;
    }
  } else if (NEEDS_APP.has(ext)) {
    console.warn(`skip     ${file}  (${ext} needs its source app — export to .glb/.fbx/.obj first)`);
    skipped++;
  }
  // non-model files are ignored silently
}

console.log(
  `\nDone → apps/designs/src/models/  (${converted} converted, ${copied} copied, ${skipped} skipped)`
);
console.log("Open/refresh the Design Studio (npm run dev:designs) to see them.");
