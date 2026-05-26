// Pre-flight check: catches the common "why won't it boot" causes before you
// hit them. Run with: npm run doctor
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const MIN_NODE_MAJOR = 20;
const PORTS = [2567, 5173];
let problems = 0;

// Node version
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor >= MIN_NODE_MAJOR) {
  console.log(`✓ Node ${process.versions.node}`);
} else {
  console.log(`✗ Node ${process.versions.node} — need >= ${MIN_NODE_MAJOR} (see .nvmrc)`);
  problems++;
}

// Dependencies installed
if (existsSync("node_modules") && existsSync("node_modules/colyseus")) {
  console.log("✓ dependencies installed");
} else {
  console.log("✗ dependencies missing — run: npm install");
  problems++;
}

// Ports free
for (const port of PORTS) {
  let pids = "";
  try {
    pids = execSync(`lsof -ti tcp:${port}`, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    /* nothing listening */
  }
  if (pids) {
    console.log(`⚠ port ${port} in use (pid ${pids.split("\n").join(", ")}) — run: npm run free-ports`);
  } else {
    console.log(`✓ port ${port} free`);
  }
}

console.log(
  problems === 0
    ? "\nAll good — run `npm run dev`."
    : `\n${problems} problem(s) found — fix the ✗ items above.`
);
process.exit(problems > 0 ? 1 : 0);
