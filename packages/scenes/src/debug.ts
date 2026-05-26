// Flaggable debug logging.
//   • ON during `vite` dev (import.meta.env.DEV === true)
//   • ON in any build when the URL has ?debug
//   • OFF in production builds otherwise — so logs never ship as noise.
const params =
  typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();

// `import.meta.env` is provided by Vite at the consuming app's build; cast so
// this package typechecks standalone (no vite/client types needed here).
const viteEnv = (import.meta as { env?: { DEV?: boolean } }).env;
export const DEBUG: boolean = Boolean(viteEnv?.DEV) || params.has("debug");

const TAG = "%c[TJC]";
const TAG_STYLE = "color:#6affd0;font-weight:bold";

export function dbg(...args: unknown[]): void {
  if (DEBUG) console.log(TAG, TAG_STYLE, ...args);
}

export function dbgWarn(...args: unknown[]): void {
  if (DEBUG) console.warn(TAG, TAG_STYLE, ...args);
}

export function dbgError(...args: unknown[]): void {
  // Errors always log (even in prod) — they matter regardless of the flag.
  console.error(TAG.replace("%c", ""), ...args);
}
