import { Client } from "colyseus.js";
import { SERVER_PORT } from "@tjc/core";

/** The Colyseus server runs on the same host that served this page, at
 *  SERVER_PORT. On the laptop that's localhost; on a phone it's the LAN IP
 *  baked into the QR/join URL — `location.hostname` resolves to the right one. */
export function makeClient(): Client {
  return new Client(`ws://${location.hostname}:${SERVER_PORT}`);
}

/** HTTP base for the server (e.g. /lan-info), same host + SERVER_PORT. */
export function serverHttpBase(): string {
  return `http://${location.hostname}:${SERVER_PORT}`;
}
