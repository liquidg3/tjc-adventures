// Remove build artifacts across the monorepo. With --modules, also nuke
// node_modules everywhere (use `npm run reset` to clean + reinstall).
import { rmSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const wipeModules = process.argv.includes("--modules");
const artifacts = ["dist", "build", ".vite"];

function workspaceDirs() {
  const dirs = [root];
  for (const group of ["apps", "packages"]) {
    const base = join(root, group);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base)) {
      const p = join(base, entry);
      if (statSync(p).isDirectory()) dirs.push(p);
    }
  }
  return dirs;
}

let removed = 0;
for (const dir of workspaceDirs()) {
  const targets = [...artifacts, ...(wipeModules ? ["node_modules"] : [])];
  for (const t of targets) {
    const target = join(dir, t);
    if (existsSync(target)) {
      rmSync(target, { recursive: true, force: true });
      console.log("rm", target.replace(root + "/", ""));
      removed++;
    }
  }
}
console.log(`clean: removed ${removed} dir(s)${wipeModules ? " (incl. node_modules)" : ""}`);
