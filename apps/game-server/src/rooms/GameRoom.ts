import colyseus from "colyseus";
import {
  AVATAR_IDS,
  isAvatarId,
  isPlayableRole,
  type ClaimRoleRequest,
  type ClaimRoleResult,
  type JoinOptions,
  type PilotInput,
  type PlayableRole,
  type Role,
} from "@tjc/core";
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
    this.onMessage("pilot-input", (client, input: PilotInput) => {
      const player = this.state.players.get(client.sessionId);
      if (player?.role !== "pilot") return;
      this.broadcast("pilot-input", {
        clientId: client.sessionId,
        vx: clamp(input?.vx, -1, 1),
        vz: clamp(input?.vz, -1, 1),
        boosting: input?.boosting === true,
        dodge: clamp(input?.dodge ?? 0, -1, 1),
      });
    });
    this.onMessage("claim-role", (client, request: ClaimRoleRequest = {}) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      const result = this.claimRole(client.sessionId, player, request);
      client.send("claim-role-result", result);
      console.log(
        `[meadow ${this.roomId}] claim ${client.sessionId} ` +
          `role=${request?.role ?? "?"} ok=${result.ok} ` +
          `(${result.message ?? "claimed"})`
      );
    });
  }

  onJoin(client: Client, options: JoinOptions = {}) {
    const player = new Player();
    player.id = client.sessionId;
    player.role = this.initialRole(client.sessionId, options.role);
    player.device = options.device ?? "unknown";
    player.name = cleanName(options.name, player.device === "laptop" ? "Host" : "");
    player.avatar = cleanAvatar(options.avatar);
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

  private claimRole(
    sessionId: string,
    player: Player,
    request: ClaimRoleRequest,
  ): ClaimRoleResult {
    if (!isPlayableRole(request.role)) {
      return { ok: false, message: "Choose a real crew role." };
    }
    if (this.roleTaken(request.role, sessionId)) {
      return { ok: false, message: `${roleLabel(request.role)} is already taken.` };
    }

    player.role = request.role;
    player.name = cleanName(request.name, player.name || "Player");
    player.avatar = cleanAvatar(request.avatar);
    return {
      ok: true,
      role: player.role as Role,
      name: player.name,
      avatar: player.avatar,
      message: `${roleLabel(request.role)} claimed.`,
    };
  }

  private initialRole(sessionId: string, role: Role | undefined): Role {
    if (isPlayableRole(role) && !this.roleTaken(role, sessionId)) return role;
    return "unassigned";
  }

  private roleTaken(role: PlayableRole, exceptSessionId?: string) {
    for (const [id, player] of this.state.players.entries()) {
      if (id === exceptSessionId) continue;
      if (player.role === role) return true;
    }
    return false;
  }
}

function clamp(v: unknown, lo: number, hi: number) {
  return typeof v === "number" && Number.isFinite(v)
    ? Math.max(lo, Math.min(hi, v))
    : 0;
}

function cleanName(name: unknown, fallback: string) {
  if (typeof name !== "string") return fallback;
  const cleaned = name.replace(/\s+/g, " ").trim().slice(0, 18);
  return cleaned || fallback;
}

function cleanAvatar(avatar: unknown) {
  return isAvatarId(avatar) ? avatar : AVATAR_IDS[0];
}

function roleLabel(role: PlayableRole) {
  switch (role) {
    case "pilot":
      return "Pilot";
    case "gunner":
      return "Gunner";
    case "spotter":
      return "Spotter";
  }
}
