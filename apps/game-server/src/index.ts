import { createServer } from "node:http";
import express from "express";
import cors from "cors";
import colyseus from "colyseus";
import wsTransport from "@colyseus/ws-transport";
import { ROOM_NAME, SERVER_PORT, CLIENT_PORT, type LanInfo } from "@tjc/core";
import { GameRoom } from "./rooms/GameRoom";
import { getLanIp } from "./lanIp";

const app = express();
app.use(cors());

// Lets the table screen discover the host's LAN IP to build the join QR.
app.get("/lan-info", (_req, res) => {
  const info: LanInfo = {
    lanIp: getLanIp(),
    serverPort: SERVER_PORT,
    clientPort: CLIENT_PORT,
  };
  res.json(info);
});
app.get("/health", (_req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const gameServer = new colyseus.Server({
  transport: new wsTransport.WebSocketTransport({ server: httpServer }),
});
gameServer.define(ROOM_NAME, GameRoom);

gameServer
  .listen(SERVER_PORT)
  .then(() => {
    const lanIp = getLanIp();
    console.log("\n  TJC: Family Adventures — game-server up");
    console.log(`  • table screen (host): http://localhost:${CLIENT_PORT}`);
    console.log(`  • phones join via:     http://${lanIp}:${CLIENT_PORT}/join`);
    console.log(`  • colyseus websocket:  ws://${lanIp}:${SERVER_PORT}\n`);
  })
  .catch((err) => {
    console.error("Failed to start game-server:", err);
    process.exit(1);
  });
