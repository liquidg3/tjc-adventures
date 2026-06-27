// Headless end-to-end check of the M0 cross-device spine:
// create a room with the host in Pilot, join phones as unassigned, claim an
// open role, confirm duplicate claims are rejected, and confirm a simple input
// message flows. Uses Node's global WebSocket (Node 21+).
import { Client } from "colyseus.js";

const PORT = 2567;
const client = new Client(`ws://localhost:${PORT}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const host = await client.create("meadow", {
  role: "pilot",
  device: "laptop",
  name: "Host",
  avatar: "comet-cadet",
});
const phone = await client.joinById(host.roomId, { role: "unassigned", device: "phone" });
const secondPhone = await client.joinById(host.roomId, { role: "unassigned", device: "phone" });

await sleep(600); // let state sync

const waitForClaim = (room) => new Promise((resolve) => room.onMessage("claim-role-result", resolve));
const firstClaim = waitForClaim(phone);
phone.send("claim-role", { role: "gunner", name: "Junie", avatar: "nova-knight" });
const firstClaimResult = await firstClaim;

const duplicateClaim = waitForClaim(secondPhone);
secondPhone.send("claim-role", { role: "gunner", name: "Cloe", avatar: "signal-sprite" });
const duplicateClaimResult = await duplicateClaim;

await sleep(200);

const count = host.state.players.size;
const roles = [...host.state.players.values()].map((p) => p.role);
console.log(`roomId=${host.roomId}  players=${count}`);
host.state.players.forEach((p) => console.log(`  • ${p.role} ${p.name || "unnamed"} (${p.device}) ${p.avatar}`));
console.log(`firstClaim=${firstClaimResult.ok} ${firstClaimResult.message ?? ""}`);
console.log(`duplicateClaim=${duplicateClaimResult.ok} ${duplicateClaimResult.message ?? ""}`);

let gotPong = false;
let gotGunnerInput = false;
phone.onMessage("pong", () => (gotPong = true));
phone.onMessage("gunner-input", () => {});
secondPhone.onMessage("gunner-input", () => {});
host.onMessage("gunner-input", (input) => {
  gotGunnerInput = input?.firing === true && input?.x >= 0 && input?.x <= 1 && input?.y >= 0 && input?.y <= 1;
});
phone.send("ping");
phone.send("gunner-input", { x: 0.52, y: 0.34, firing: true });
await sleep(300);

await secondPhone.leave();
await phone.leave();
await host.leave();

const ok =
  count >= 3 &&
  gotPong &&
  gotGunnerInput &&
  firstClaimResult.ok === true &&
  duplicateClaimResult.ok === false &&
  roles.includes("pilot") &&
  roles.includes("gunner");
console.log(ok ? "SPINE OK ✅ (room sync + input message both work)" : "SPINE FAIL ❌");
process.exit(ok ? 0 : 1);
