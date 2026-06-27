// @tjc/core — shared, renderer-agnostic game definitions used by the server and
// every client. Pure TypeScript, no engine/server/UI dependencies.

/** Colyseus room name for the Sky Raid world. */
export const ROOM_NAME = "meadow";

/** Dev ports (see architecture.md §8). */
export const SERVER_PORT = 2567;
export const CLIENT_PORT = 5173;

/** The roles a player can occupy on the shared vessel (brief.md §5). */
export const PLAYABLE_ROLES = ["pilot", "gunner", "spotter"] as const;
export type PlayableRole = (typeof PLAYABLE_ROLES)[number];
export type Role = "host" | PlayableRole | "unassigned";

/** Lightweight v1 profile portraits for the same-room lobby. */
export const AVATAR_IDS = [
  "comet-cadet",
  "circuit-champ",
  "nova-knight",
  "signal-sprite",
] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];

/** Options a client sends when joining a room. */
export interface JoinOptions {
  role?: Role;
  device?: string;
  name?: string;
  avatar?: AvatarId | string;
}

/** Request a role seat after joining a room as unassigned. */
export interface ClaimRoleRequest {
  role?: Role;
  name?: string;
  avatar?: AvatarId | string;
}

/** Server acknowledgement for an attempted role claim. */
export interface ClaimRoleResult {
  ok: boolean;
  role?: Role;
  name?: string;
  avatar?: AvatarId | string;
  message?: string;
}

/** Lightweight phone-control packet for the LAN playtest path. */
export interface PilotInput {
  vx: number;
  vz: number;
  boosting: boolean;
  dodge?: number;
}

/** Phone Gunner aim packet. x/y are normalized against the shared playfield. */
export interface GunnerInput {
  x: number;
  y: number;
  firing: boolean;
}

/** Authoritative world snapshot the laptop host broadcasts so replica views
 *  (the Gunner station) render exactly what the shared table screen shows. */
export interface HostState {
  shipX: number;
  shipY: number;
  shipZ: number;
  scrollZ: number;
}

/** Host-discovery info served at GET /lan-info so the table screen can build a
 *  join QR that phones on the LAN can reach. */
export interface LanInfo {
  lanIp: string;
  serverPort: number;
  clientPort: number;
}

export function isPlayableRole(role: unknown): role is PlayableRole {
  return typeof role === "string" && (PLAYABLE_ROLES as readonly string[]).includes(role);
}

export function isAvatarId(avatar: unknown): avatar is AvatarId {
  return typeof avatar === "string" && (AVATAR_IDS as readonly string[]).includes(avatar);
}
