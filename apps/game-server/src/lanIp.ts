import { networkInterfaces } from "node:os";

/** Best-effort LAN IPv4 address so phones on the same WiFi can reach the host.
 *  Node has flip-flopped on whether `family` is "IPv4" or 4 — handle both. */
export function getLanIp(): string {
  const ifaces = networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] ?? []) {
      const isIPv4 = iface.family === "IPv4" || (iface.family as unknown) === 4;
      if (isIPv4 && !iface.internal) return iface.address;
    }
  }
  return "localhost";
}
