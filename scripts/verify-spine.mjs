// Headless end-to-end check of the M0 cross-device spine:
// create a room as the "host", join it as a "phone", confirm both are present,
// and that an input message flows. Uses Node's global WebSocket (Node 21+).
import { Client } from "colyseus.js";

const PORT = 2567;
const client = new Client(`ws://localhost:${PORT}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const host = await client.create("meadow", { role: "host", device: "laptop" });
const phone = await client.joinById(host.roomId, { role: "spotter", device: "phone" });

await sleep(600); // let state sync

const count = host.state.players.size;
console.log(`roomId=${host.roomId}  players=${count}`);
host.state.players.forEach((p) => console.log(`  • ${p.role} (${p.device})`));

let gotPong = false;
phone.onMessage("pong", () => (gotPong = true));
phone.send("ping");
await sleep(300);

await phone.leave();
await host.leave();

const ok = count >= 2 && gotPong;
console.log(ok ? "SPINE OK ✅ (room sync + input message both work)" : "SPINE FAIL ❌");
process.exit(ok ? 0 : 1);
