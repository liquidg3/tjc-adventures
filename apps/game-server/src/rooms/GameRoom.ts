import colyseus from "colyseus";
import type { JoinOptions } from "@tjc/core";
import { GameState, Player } from "../state/GameState";

// `colyseus` is CommonJS; default-import the namespace so Node's ESM loader
// doesn't choke on named exports it can't statically detect.
type Client = colyseus.Client;

/** The Sky Raid room. M0: accept joins, track players, broadcast presence. */
export class GameRoom extends colyseus.Room<GameState> {
  maxClients = 6;

  onCreate() {
    this.setState(new GameState());
    this.state.code = this.roomId;

    // Simple latency probe for the controller to sanity-check the connection.
    this.onMessage("ping", (client) => client.send("pong", { t: Date.now() }));
  }

  onJoin(client: Client, options: JoinOptions = {}) {
    const player = new Player();
    player.id = client.sessionId;
    player.role = options.role ?? "unassigned";
    player.device = options.device ?? "unknown";
    player.name = options.name ?? "";
    this.state.players.set(client.sessionId, player);

    console.log(
      `[meadow ${this.roomId}] +join ${client.sessionId} ` +
        `role=${player.role} device=${player.device} ` +
        `(${this.state.players.size} present)`
    );
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    console.log(
      `[meadow ${this.roomId}] -leave ${client.sessionId} ` +
        `(${this.state.players.size} present)`
    );
  }
}
