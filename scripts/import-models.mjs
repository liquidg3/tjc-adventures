// One-time import of Junie's downloaded models into the Design Studio,
// organized by category. Standalone .glb are copied; Sketchfab scene.gltf
// packages (gltf + .bin + textures) are bundled into self-contained .glb via
// gltf-pipeline. Source files are left in ~/Downloads as a backup.
//
//   node scripts/import-models.mjs
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const DL = join(homedir(), "Downloads");
const DEST = join(process.cwd(), "apps/studio/src/models");
const GLTF_PIPELINE = join(process.cwd(), "node_modules/.bin/gltf-pipeline");

// [ source (rel to ~/Downloads), dest (rel to src/models) ]
const COPY = [
  ["helicopter_space_ship.glb", "ships/ship_helicopter.glb"],
  ["fur_tree.glb", "environment/tree_fur.glb"],
  ["stylized_tree.glb", "environment/tree_stylized.glb"],
  ["grass_claster__downoad__like_please.glb", "environment/grass.glb"],
  ["photorealistic_bush.glb", "environment/bush.glb"],
  ["small_rocks.glb", "environment/rocks_small.glb"],
  ["wooden_crate.glb", "props/box_crate.glb"],
  ["dragon_fruit_prop.glb", "props/fruit_dragon.glb"],
  ["pomegranate_fruit.glb", "props/fruit_pomegranate.glb"],
];

// gltf packages → bundled into a single self-contained .glb
const CONVERT = [
  ["space_ship/scene.gltf", "ships/ship_classic.glb"],
  ["cheetah_a_posed_0129/scene.gltf", "animals/cheetah.glb"],
  ["fox_idle/scene.gltf", "animals/fox.glb"],
  ["rabbit_rigged/scene.gltf", "animals/bunny.glb"],
  ["sloth_with_arms_raised/scene.gltf", "animals/sloth.glb"],
  ["brent_hill_chapel_ruin/scene.gltf", "terrain/hill_chapel_ruin.glb"],
  ["castle_hill_playground/scene.gltf", "terrain/hill_castle_playground.glb"],
  ["london_roman_wall_at_tower_hill/scene.gltf", "terrain/hill_roman_wall.glb"],
  ["sydenham_hill_wood_folly/scene.gltf", "terrain/hill_wood_folly.glb"],
  ["the_recycle_hill__bishan-ang_mo_kio_park/scene.gltf", "terrain/hill_recycle_park.glb"],
  ["grey_rocks_clear_hill_point/scene.gltf", "terrain/rocks_grey_hill.glb"],
  ["cage/scene.gltf", "props/cage.glb"],
  ["orange_fruit/scene.gltf", "props/fruit_orange.glb"],
  ["cherry_free_download/scene.gltf", "props/berries_cherry.glb"],
];

const ensureDir = (p) => mkdirSync(dirname(p), { recursive: true });
let copied = 0,
  bundled = 0,
  missing = 0,
  failed = 0;

for (const [s, d] of COPY) {
  const src = join(DL, s);
  const out = join(DEST, d);
  if (!existsSync(src)) {
    console.warn(`MISS   ${s}`);
    missing++;
    continue;
  }
  ensureDir(out);
  copyFileSync(src, out);
  console.log(`copy   ${d}`);
  copied++;
}

for (const [s, d] of CONVERT) {
  const src = join(DL, s);
  const out = join(DEST, d);
  if (!existsSync(src)) {
    console.warn(`MISS   ${s}`);
    missing++;
    continue;
  }
  ensureDir(out);
  try {
    execFileSync(GLTF_PIPELINE, ["-i", src, "-o", out], { stdio: "ignore" });
    console.log(`bundle ${d}`);
    bundled++;
  } catch (err) {
    console.error(`FAIL   ${d}  (${err.message})`);
    failed++;
  }
}

console.log(
  `\n${copied} copied, ${bundled} bundled, ${missing} missing, ${failed} failed → apps/designs/src/models/`
);
