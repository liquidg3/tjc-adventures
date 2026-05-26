import type { ResolvedLighting } from "./lighting-controller";
import type { LevelPlan, ZonePlanEntry } from "./scene-config";

/**
 * Drives an auto-scrolling level as a continuous track. The ship advances along
 * the track at the world scroll speed; each zone (climate) occupies `lengthSec`
 * of travel. Zone boundaries are marks on the track that map to a world-Z and
 * drift toward the camera at scroll speed — so a climate boundary is a real line
 * you fly through, not a timed wipe. Lighting cross-fades as that line crosses
 * the field. The track loops so the Studio can preview it continuously.
 */
export interface ZoneSequencerConfig {
  /** world units / second the field scrolls (matches the scene's SCROLL) */
  scrollSpeed: number;
  /** ship's reference Z on the field (where a boundary "arrives") */
  shipZ: number;
  /** far ground edge world-Z (a boundary appears here, at the horizon) */
  seamFar: number;
  /** near ground edge world-Z (a boundary retires here, past the camera) */
  seamNear: number;
}

export interface ZoneSequencerDeps {
  /** Steady state: one climate fills the whole field (scene dedups repaints). */
  showGround: (entry: ZonePlanEntry) => void;
  /** A boundary is on screen: `near` fills z < seamZ, `far` fills z > seamZ. */
  transitionGround: (near: ZonePlanEntry, far: ZonePlanEntry, seamZ: number) => void;
  resolveLighting: (entry: ZonePlanEntry) => ResolvedLighting;
  applyLighting: (r: ResolvedLighting) => void;
}

export interface ZoneSequencer {
  setPlan: (plan: LevelPlan | null) => void;
  update: (dt: number) => void;
  getStatus: () => { index: number; name: string; progress: number } | null;
}

export function createZoneSequencer(
  deps: ZoneSequencerDeps,
  config: ZoneSequencerConfig,
): ZoneSequencer {
  const { scrollSpeed, shipZ, seamFar, seamNear } = config;
  let plan: LevelPlan | null = null;
  let resolved: ResolvedLighting[] = [];
  let zoneDist: number[] = []; // world-distance the ship travels through each zone
  let cum: number[] = []; // cumulative start distance of each zone
  let total = 0;
  let dist = 0; // ship's distance along the track
  let status: { index: number; name: string; progress: number } | null = null;

  const zoneLen = (z: ZonePlanEntry) => Math.max(0.1, z.lengthSec);

  function setPlan(next: LevelPlan | null) {
    plan = next && next.zones.length ? next : null;
    dist = 0;
    status = null;
    resolved = [];
    zoneDist = [];
    cum = [];
    total = 0;
    if (!plan) return;
    resolved = plan.zones.map((z) => deps.resolveLighting(z));
    let acc = 0;
    for (const z of plan.zones) {
      cum.push(acc);
      const d = zoneLen(z) * scrollSpeed;
      zoneDist.push(d);
      acc += d;
    }
    total = acc;
    deps.showGround(plan.zones[0]); // show zone 0 immediately
    deps.applyLighting(resolved[0]);
    status = { index: 0, name: plan.zones[0].name, progress: 0 };
  }

  function update(dt: number) {
    if (!plan) return;
    const zones = plan.zones;
    const n = zones.length;
    dist = (dist + scrollSpeed * dt) % total;

    // ship's current zone j: cum[j] <= dist < cum[j] + zoneDist[j]
    let j = 0;
    while (j < n - 1 && dist >= cum[j + 1]) j++;
    const localDist = dist - cum[j];
    const distToNext = zoneDist[j] - localDist; // until the next boundary reaches the ship

    // boundaries map to world-Z = shipZ + (distance ahead of the ship)
    const inSeamZ = shipZ + distToNext; // upcoming boundary, drifting seamFar → shipZ → …
    const outSeamZ = shipZ - localDist; // boundary just crossed, drifting shipZ → seamNear

    let seamZ: number | null = null;
    let nearIdx = j;
    let farIdx = j;
    if (n > 1 && inSeamZ <= seamFar) {
      seamZ = inSeamZ; // upcoming climate fills the far field
      nearIdx = j;
      farIdx = (j + 1) % n;
    } else if (n > 1 && outSeamZ >= seamNear) {
      seamZ = outSeamZ; // the climate we just left retires at the near edge
      nearIdx = (j - 1 + n) % n;
      farIdx = j;
    }

    if (seamZ !== null) {
      // lighting tracks the boundary across the field: 0 at the horizon, 1 once
      // it exits past the camera — so the sky finishes shifting as the ground does
      const f = clamp((seamFar - seamZ) / (seamFar - seamNear), 0, 1);
      deps.applyLighting(lerpResolved(resolved[nearIdx], resolved[farIdx], f));
      deps.transitionGround(zones[nearIdx], zones[farIdx], seamZ);
    } else {
      deps.applyLighting(resolved[j]);
      deps.showGround(zones[j]);
    }
    status = { index: j, name: zones[j].name, progress: localDist / zoneDist[j] };
  }

  return { setPlan, update, getStatus: () => status };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function lerpAngle(a: number, b: number, t: number) {
  const d = ((b - a + 540) % 360) - 180; // shortest path around the compass
  return a + d * t;
}

function lerpResolved(a: ResolvedLighting, b: ResolvedLighting, t: number): ResolvedLighting {
  const L = (x: number, y: number) => x + (y - x) * t;
  const C = (
    x: [number, number, number],
    y: [number, number, number],
  ): [number, number, number] => [L(x[0], y[0]), L(x[1], y[1]), L(x[2], y[2])];
  return {
    azimuth: lerpAngle(a.azimuth, b.azimuth, t),
    elevation: L(a.elevation, b.elevation),
    sunI: L(a.sunI, b.sunI),
    sunC: C(a.sunC, b.sunC),
    skyI: L(a.skyI, b.skyI),
    skyC: C(a.skyC, b.skyC),
    groundC: C(a.groundC, b.groundC),
    clear: C(a.clear, b.clear),
    shadowDark: L(a.shadowDark, b.shadowDark),
  };
}
