// Free the given TCP ports by killing whatever is listening on them.
// Prevents EADDRINUSE on restart and kills orphaned dev processes.
// macOS / Linux (uses `lsof`). Usage: node scripts/free-ports.mjs 2567 5173
import { execSync } from "node:child_process";

const ports = process.argv.slice(2);
if (ports.length === 0) {
  console.log("free-ports: no ports given");
  process.exit(0);
}

for (const port of ports) {
  let pids = [];
  try {
    pids = execSync(`lsof -ti tcp:${port}`, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    // lsof exits non-zero when nothing is listening — port already free.
  }
  if (pids.length === 0) continue;
  for (const pid of pids) {
    try {
      process.kill(Number(pid), "SIGTERM");
    } catch {
      /* already gone */
    }
  }
  console.log(`free-ports: freed :${port} (stopped pid ${pids.join(", ")})`);
}
