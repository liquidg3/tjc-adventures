// Hard ceiling on concurrent WebGL contexts.
//
// Browsers keep only ~16 live WebGL contexts per page; past that they silently
// drop the OLDEST context, which corrupts whatever Babylon engine owned it
// ("Unable to create texture / vertex buffer / uniform buffer"). The 3D Models
// board renders one engine per assigned card, so a full board blew the limit and
// took down every other engine on the page (including the vertical scroller).
//
// Each preview leases a slot before it spins up an engine and releases it when it
// scrolls out of view or unmounts. Cards that are visible but over budget wait in
// a queue and mount as soon as a slot frees.
const MAX_CONTEXTS = 6;

let active = 0;
const waiters: Array<() => void> = [];

/** Try to take a context slot. Returns false if we're at the ceiling. */
export function acquireContext(): boolean {
  if (active < MAX_CONTEXTS) {
    active++;
    return true;
  }
  return false;
}

/** Give a slot back and wake the next waiter, if any. */
export function releaseContext(): void {
  active = Math.max(0, active - 1);
  const next = waiters.shift();
  if (next) next();
}

/** Register to be called when a slot frees. Returns an unsubscribe fn. */
export function onContextFreed(cb: () => void): () => void {
  waiters.push(cb);
  return () => {
    const i = waiters.indexOf(cb);
    if (i >= 0) waiters.splice(i, 1);
  };
}
