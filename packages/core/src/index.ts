// @tjc/core — shared, renderer-agnostic game definitions used by the server and
// every client. Pure TypeScript, no engine/server/UI dependencies.

/** Colyseus room name for the Sky Raid world. */
export const ROOM_NAME = "meadow";

/** Dev ports (see architecture.md §8). */
export const SERVER_PORT = 2567;
export const CLIENT_PORT = 5173;

/** The roles a player can occupy on the shared vessel (brief.md §5). */
export type Role = "host" | "pilot" | "gunner" | "spotter" | "unassigned";

/** Options a client sends when joining a room. */
export interface JoinOptions {
  role?: Role;
  device?: string;
  name?: string;
}

/** Host-discovery info served at GET /lan-info so the table screen can build a
 *  join QR that phones on the LAN can reach. */
export interface LanInfo {
  lanIp: string;
  serverPort: number;
  clientPort: number;
}
