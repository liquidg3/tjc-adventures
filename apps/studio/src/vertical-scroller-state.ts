import {
  presetSunDefaults,
  SHIP_HEIGHT,
  SHIP_SIZE,
  type CameraRotationMode,
  type GroundStyle,
  type LevelPlan,
  type LightingPreset,
  type PipelineMode,
  type SceneryDensities,
  type ShipLightingState,
  type TileSampling,
} from "@tjc/scenes";

export interface VerticalValues {
  cameraMode: CameraRotationMode;
  altitude: number;
  shipSize: number;
  ground: GroundStyle;
  /** null = procedural ground per `ground`; non-null = path to a pixel-art PNG tile. */
  groundTile: string | null;
  /** How many times the pixel-tile repeats across the ground plane each side. */
  tileRepeat: number;
  pixelLevel: number;
  pipelineMode: PipelineMode;
  rtHeight: number;
  lighting: LightingPreset;
  sunI: number;
  skyI: number;
  azimuth: number;
  elevation: number;
  shipLight: ShipLightingState;
}

/**
 * One zone in the level plan: a full ground + lighting look snapshot plus how
 * long it holds before blending into the next. The currently-selected zone is
 * mirrored into `values` so the existing Ground/Lighting panels edit it.
 */
export interface ZoneLook {
  id: string;
  name: string;
  ground: GroundStyle;
  groundTile: string | null;
  tileRepeat: number;
  lighting: LightingPreset;
  sunI: number;
  skyI: number;
  azimuth: number;
  elevation: number;
  shipLight: ShipLightingState;
  scenery: string; // SceneryPreset id
  lengthSec: number;
}

/** The look fields a zone owns (shared between a zone and the live `values`). */
export type ZoneLookFields = Pick<
  VerticalValues,
  | "ground"
  | "groundTile"
  | "tileRepeat"
  | "lighting"
  | "sunI"
  | "skyI"
  | "azimuth"
  | "elevation"
  | "shipLight"
>;

export interface VerticalDefaults extends VerticalValues {
  shipSizeByModel: Record<string, number>;
  zones: ZoneLook[];
  blendSec: number;
}

export interface VerticalScrollerState {
  hydrated: boolean;
  savedDefaults: VerticalDefaults;
  shipSizeByModel: Record<string, number>;
  playerShipUrl: string | null;
  saveStamp: "" | "saving" | "saved" | "error";
  openLeft: string;
  openRight: string;
  values: VerticalValues;
  zones: ZoneLook[];
  selectedZone: number;
  blendSec: number;
  playing: boolean;
}

export const DEFAULT_SHIP_LIGHTING: ShipLightingState = {
  directIntensity: 2.2,
  environmentIntensity: 0.08,
  roughness: 0.45,
  specularIntensity: 1,
  exposure: 1.2,
  contrast: 1.05,
  albedoBoost: 1,
  ambientStrength: 0.16,
};

/**
 * The starting 4-zone plan from docs/prototype-meadow-run.md (Meadow → Woodland
 * → Canyon → Approach). Each zone's sun sliders are seeded from its preset; the
 * grounds are the closest procedural styles for now (swap in real tiles later).
 */
function makeZone(
  id: string,
  name: string,
  ground: GroundStyle,
  lighting: LightingPreset,
  scenery: string,
  lengthSec: number,
): ZoneLook {
  const s = presetSunDefaults(lighting);
  return {
    id,
    name,
    ground,
    groundTile: null,
    tileRepeat: 32,
    lighting,
    sunI: s.sunI,
    skyI: s.skyI,
    azimuth: s.azimuth,
    elevation: s.elevation,
    shipLight: { ...DEFAULT_SHIP_LIGHTING },
    scenery,
    lengthSec,
  };
}

export const DEFAULT_ZONES: ZoneLook[] = [
  makeZone("zone-meadow", "Meadow", "painterly", "golden", "meadow", 60),
  makeZone("zone-woodland", "Woodland", "painterly", "overcast", "woodland", 75),
  makeZone("zone-canyon", "Canyon", "stripes", "dramatic", "canyon", 75),
  makeZone("zone-approach", "Approach", "checker", "moonlit", "barren", 60),
];

export const DEFAULT_BLEND_SEC = 4;

export const DEFAULT_VERTICAL_DEFAULTS: VerticalDefaults = {
  cameraMode: "camera-z",
  altitude: SHIP_HEIGHT,
  shipSize: SHIP_SIZE,
  ground: "painterly",
  groundTile: null,
  tileRepeat: 32,
  pixelLevel: 1,
  pipelineMode: "direct",
  rtHeight: 270,
  lighting: "dramatic",
  sunI: 2.8,
  skyI: 0.2,
  azimuth: 110,
  elevation: 84,
  shipLight: DEFAULT_SHIP_LIGHTING,
  shipSizeByModel: {},
  zones: DEFAULT_ZONES,
  blendSec: DEFAULT_BLEND_SEC,
};

export const CAMERA_ROTATIONS: Array<{ mode: CameraRotationMode; label: string }> = [
  { mode: "none", label: "None" },
  { mode: "camera-x", label: "Camera X" },
  { mode: "camera-y", label: "Camera Y" },
  { mode: "camera-z", label: "Camera Z" },
  { mode: "rig-x", label: "Rig X" },
  { mode: "rig-y", label: "Rig Y" },
  { mode: "rig-z", label: "Rig Z" },
];

export const GROUND_STYLES: Array<{ id: GroundStyle; label: string }> = [
  { id: "painterly", label: "Painterly" },
  { id: "flat", label: "Flat grass" },
  { id: "stripes", label: "Mowed stripes" },
  { id: "checker", label: "Checker" },
];

export const PIXEL_LEVELS: Array<{ level: number; label: string }> = [
  { level: 1, label: "Off" },
  { level: 2, label: "2×" },
  { level: 3, label: "3×" },
  { level: 4, label: "4×" },
];

export const PIPELINE_MODES: Array<{ id: PipelineMode; label: string }> = [
  { id: "direct", label: "Direct" },
  { id: "low-res-nearest", label: "Low-res · Nearest" },
  { id: "low-res-bilinear", label: "Low-res · Bilinear" },
];

export const RT_HEIGHTS: Array<{ h: number; label: string }> = [
  { h: 180, label: "320×180" },
  { h: 270, label: "480×270" },
  { h: 360, label: "640×360" },
  { h: 540, label: "960×540" },
];

/**
 * Ground tile catalog. `sampling` decides the filter mode the scene loads with:
 * "nearest" preserves every texel as a square (pixel-art tiles); "trilinear"
 * smooths the texture with mips (photoreal / painterly textures).
 * `defaultRepeat` is just the suggested starting point on the Repeat slider —
 * the slider then lets you push it either direction.
 * Once a tile is chosen as canon, copy it under apps/game-client/public/textures/
 * so the game-client app can load it too.
 */
export interface GroundTile {
  id: string;
  label: string;
  url: string;
  sampling: TileSampling;
  defaultRepeat: number;
  attribution: string;
}

export const GROUND_TILES: GroundTile[] = [
  // Pixel-art (procedurally generated earlier in this session — kept for spike comparison)
  { id: "meadow-classic", label: "Meadow · Classic", url: "/textures/grass/meadow-classic.png", sampling: "nearest", defaultRepeat: 32, attribution: "Generated" },
  { id: "meadow-tufted", label: "Meadow · Tufted", url: "/textures/grass/meadow-tufted.png", sampling: "nearest", defaultRepeat: 32, attribution: "Generated" },
  { id: "meadow-sparse", label: "Meadow · Sparse", url: "/textures/grass/meadow-sparse.png", sampling: "nearest", defaultRepeat: 32, attribution: "Generated" },
  // Real CC0 textures — photoreal (Poly Haven) + hand-painted (OpenGameArt)
  { id: "aerial-grass-rock", label: "Aerial Grass Rock", url: "/textures/ground/aerial-grass-rock.jpg", sampling: "trilinear", defaultRepeat: 6, attribution: "Poly Haven · CC0" },
  { id: "sparse-grass", label: "Sparse Grass", url: "/textures/ground/sparse-grass.jpg", sampling: "trilinear", defaultRepeat: 6, attribution: "Poly Haven · CC0" },
  { id: "grass-path", label: "Grass Path", url: "/textures/ground/grass-path.jpg", sampling: "trilinear", defaultRepeat: 6, attribution: "Poly Haven · CC0" },
  { id: "painted-grass", label: "Painted Grass", url: "/textures/ground/painted-grass.png", sampling: "trilinear", defaultRepeat: 8, attribution: "OpenGameArt · CC0" },
  { id: "seamless-grass", label: "Seamless Grass", url: "/textures/ground/seamless-grass.jpg", sampling: "trilinear", defaultRepeat: 6, attribution: "OpenGameArt · CC0" },
];

export function findTile(url: string | null): GroundTile | undefined {
  if (url == null) return undefined;
  return GROUND_TILES.find((t) => t.url === url);
}

export const LIGHTING_PRESETS: Array<{ id: LightingPreset; label: string }> = [
  { id: "noon", label: "Noon" },
  { id: "golden", label: "Golden hour" },
  { id: "overcast", label: "Overcast" },
  { id: "dramatic", label: "Dramatic" },
  { id: "moonlit", label: "Moonlit" },
];

/** Named scenery mixes (per-model density 0..1) a climate can use. */
export interface SceneryPreset {
  id: string;
  label: string;
  densities: SceneryDensities;
}

export const SCENERY_PRESETS: SceneryPreset[] = [
  { id: "meadow", label: "Meadow (bushes)", densities: { bush: 0.6, rock: 0.3, tree_fur: 0.2 } },
  { id: "woodland", label: "Woodland (trees)", densities: { tree_fur: 0.9, tree_stylized: 0.9, bush: 0.4 } },
  { id: "canyon", label: "Canyon (rocks)", densities: { rock: 0.9, tree_stylized: 0.15 } },
  { id: "sparse", label: "Sparse", densities: { rock: 0.35, bush: 0.2 } },
  { id: "barren", label: "Barren", densities: {} },
];

export function findScenery(id: string): SceneryPreset {
  return SCENERY_PRESETS.find((p) => p.id === id) ?? SCENERY_PRESETS[0];
}

export function readHashParams() {
  const raw = location.hash.replace(/^#/, "");
  const [, qs = ""] = raw.split("?");
  return new URLSearchParams(qs);
}

function readNumber(params: URLSearchParams, key: string, fallback: number) {
  const raw = params.get(key);
  if (raw == null) return fallback;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

function readEnum<T extends string>(params: URLSearchParams, key: string, allowed: readonly T[], fallback: T): T {
  const raw = params.get(key);
  return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

const num = (v: unknown, fb: number) => (typeof v === "number" && Number.isFinite(v) ? v : fb);

/** Defensively fill any fields missing from a persisted/older zone record. */
function normalizeZone(z: Partial<ZoneLook>, i: number): ZoneLook {
  const base = DEFAULT_ZONES[i % DEFAULT_ZONES.length];
  return {
    id: z.id ?? `zone-${i}-${Math.random().toString(36).slice(2, 7)}`,
    name: z.name ?? base.name,
    ground: z.ground ?? base.ground,
    groundTile: z.groundTile ?? null,
    tileRepeat: num(z.tileRepeat, base.tileRepeat),
    lighting: z.lighting ?? base.lighting,
    sunI: num(z.sunI, base.sunI),
    skyI: num(z.skyI, base.skyI),
    azimuth: num(z.azimuth, base.azimuth),
    elevation: num(z.elevation, base.elevation),
    shipLight: { ...DEFAULT_SHIP_LIGHTING, ...(z.shipLight ?? {}) },
    scenery: z.scenery ?? base.scenery,
    lengthSec: num(z.lengthSec, base.lengthSec),
  };
}

/** Migration: a saved file with no `zones` (pre-zones) keeps the user's tuned
 *  flat look as zone 0, with the rest of the default plan after it. */
function seedZonesFromLook(data: Partial<VerticalDefaults> | null | undefined): ZoneLook[] {
  const first: ZoneLook = {
    ...DEFAULT_ZONES[0],
    ground: data?.ground ?? DEFAULT_ZONES[0].ground,
    groundTile: data?.groundTile ?? DEFAULT_ZONES[0].groundTile,
    tileRepeat: num(data?.tileRepeat, DEFAULT_ZONES[0].tileRepeat),
    lighting: data?.lighting ?? DEFAULT_ZONES[0].lighting,
    sunI: num(data?.sunI, DEFAULT_ZONES[0].sunI),
    skyI: num(data?.skyI, DEFAULT_ZONES[0].skyI),
    azimuth: num(data?.azimuth, DEFAULT_ZONES[0].azimuth),
    elevation: num(data?.elevation, DEFAULT_ZONES[0].elevation),
    shipLight: { ...DEFAULT_SHIP_LIGHTING, ...(data?.shipLight ?? {}) },
  };
  return [first, ...DEFAULT_ZONES.slice(1)];
}

export function mergeDefaults(data: Partial<VerticalDefaults> | null | undefined): VerticalDefaults {
  return {
    ...DEFAULT_VERTICAL_DEFAULTS,
    ...data,
    shipLight: {
      ...DEFAULT_VERTICAL_DEFAULTS.shipLight,
      ...(data?.shipLight ?? {}),
    },
    shipSizeByModel: {
      ...DEFAULT_VERTICAL_DEFAULTS.shipSizeByModel,
      ...(data?.shipSizeByModel ?? {}),
    },
    zones: data?.zones?.length ? data.zones.map(normalizeZone) : seedZonesFromLook(data),
    blendSec: num(data?.blendSec, DEFAULT_VERTICAL_DEFAULTS.blendSec),
  };
}

/** Pull the zone-owned look fields out of the live `values`. */
function lookFields(v: VerticalValues): ZoneLookFields {
  return {
    ground: v.ground,
    groundTile: v.groundTile,
    tileRepeat: v.tileRepeat,
    lighting: v.lighting,
    sunI: v.sunI,
    skyI: v.skyI,
    azimuth: v.azimuth,
    elevation: v.elevation,
    shipLight: v.shipLight,
  };
}

/** The look fields of a zone, shaped to overlay onto the live `values`. */
function zoneToLook(z: ZoneLook): ZoneLookFields {
  return {
    ground: z.ground,
    groundTile: z.groundTile,
    tileRepeat: z.tileRepeat,
    lighting: z.lighting,
    sunI: z.sunI,
    skyI: z.skyI,
    azimuth: z.azimuth,
    elevation: z.elevation,
    shipLight: z.shipLight,
  };
}

let zoneIdSeq = 0;
const newZoneId = () => `zone-${Date.now().toString(36)}-${zoneIdSeq++}`;

/**
 * Apply a look change to both the live `values` and the selected zone, so the
 * Ground/Lighting panels always edit the zone they're showing.
 */
function patchLook(
  state: VerticalScrollerState,
  patch: Partial<ZoneLookFields>,
): VerticalScrollerState {
  const values = { ...state.values, ...patch };
  const zones = state.zones.map((z, i) =>
    i === state.selectedZone ? { ...z, ...lookFields(values) } : z,
  );
  return { ...state, values, zones };
}

/** Map the editable zone list into the scene's LevelPlan (adds tile sampling). */
export function toLevelPlan(zones: ZoneLook[], blendSec: number): LevelPlan {
  return {
    blendSec,
    zones: zones.map((z) => ({
      name: z.name,
      ground: z.ground,
      groundTile: z.groundTile,
      tileSampling: findTile(z.groundTile)?.sampling ?? "nearest",
      tileRepeat: z.tileRepeat,
      lighting: z.lighting,
      sunI: z.sunI,
      skyI: z.skyI,
      azimuth: z.azimuth,
      elevation: z.elevation,
      shipLight: z.shipLight,
      scenery: findScenery(z.scenery).densities,
      lengthSec: z.lengthSec,
    })),
  };
}

function readValuesFromHash(params: URLSearchParams): VerticalValues {
  return {
    cameraMode: readEnum(params, "camera", CAMERA_ROTATIONS.map((v) => v.mode), DEFAULT_VERTICAL_DEFAULTS.cameraMode),
    altitude: readNumber(params, "altitude", DEFAULT_VERTICAL_DEFAULTS.altitude),
    shipSize: readNumber(params, "shipSize", DEFAULT_VERTICAL_DEFAULTS.shipSize),
    ground: readEnum(params, "ground", GROUND_STYLES.map((v) => v.id), DEFAULT_VERTICAL_DEFAULTS.ground),
    groundTile: params.get("tile") ?? DEFAULT_VERTICAL_DEFAULTS.groundTile,
    tileRepeat: readNumber(params, "tileRepeat", DEFAULT_VERTICAL_DEFAULTS.tileRepeat),
    pixelLevel: readNumber(params, "pixel", DEFAULT_VERTICAL_DEFAULTS.pixelLevel),
    pipelineMode: readEnum(params, "pipe", PIPELINE_MODES.map((v) => v.id), DEFAULT_VERTICAL_DEFAULTS.pipelineMode),
    rtHeight: readNumber(params, "rth", DEFAULT_VERTICAL_DEFAULTS.rtHeight),
    lighting: readEnum(params, "lighting", LIGHTING_PRESETS.map((v) => v.id), DEFAULT_VERTICAL_DEFAULTS.lighting),
    sunI: readNumber(params, "sun", DEFAULT_VERTICAL_DEFAULTS.sunI),
    skyI: readNumber(params, "sky", DEFAULT_VERTICAL_DEFAULTS.skyI),
    azimuth: readNumber(params, "angle", DEFAULT_VERTICAL_DEFAULTS.azimuth),
    elevation: readNumber(params, "height", DEFAULT_VERTICAL_DEFAULTS.elevation),
    shipLight: {
      directIntensity: readNumber(params, "shipDirect", DEFAULT_VERTICAL_DEFAULTS.shipLight.directIntensity),
      environmentIntensity: readNumber(params, "shipEnv", DEFAULT_VERTICAL_DEFAULTS.shipLight.environmentIntensity),
      roughness: readNumber(params, "shipRough", DEFAULT_VERTICAL_DEFAULTS.shipLight.roughness),
      specularIntensity: readNumber(params, "shipSpec", DEFAULT_VERTICAL_DEFAULTS.shipLight.specularIntensity),
      exposure: readNumber(params, "shipExposure", DEFAULT_VERTICAL_DEFAULTS.shipLight.exposure),
      contrast: readNumber(params, "shipContrast", DEFAULT_VERTICAL_DEFAULTS.shipLight.contrast),
      albedoBoost: readNumber(params, "shipAlbedo", DEFAULT_VERTICAL_DEFAULTS.shipLight.albedoBoost),
      ambientStrength: readNumber(params, "shipAmbient", DEFAULT_VERTICAL_DEFAULTS.shipLight.ambientStrength),
    },
  };
}

function hasShipLightHash(params: URLSearchParams) {
  return (
    params.has("shipDirect") ||
    params.has("shipEnv") ||
    params.has("shipRough") ||
    params.has("shipSpec") ||
    params.has("shipExposure") ||
    params.has("shipContrast") ||
    params.has("shipAlbedo") ||
    params.has("shipAmbient")
  );
}

export function createInitialState(params: URLSearchParams): VerticalScrollerState {
  return {
    hydrated: false,
    savedDefaults: DEFAULT_VERTICAL_DEFAULTS,
    shipSizeByModel: DEFAULT_VERTICAL_DEFAULTS.shipSizeByModel,
    playerShipUrl: null,
    saveStamp: "",
    openLeft: "ship-size",
    openRight: "lighting",
    values: readValuesFromHash(params),
    zones: DEFAULT_VERTICAL_DEFAULTS.zones,
    selectedZone: 0,
    blendSec: DEFAULT_VERTICAL_DEFAULTS.blendSec,
    playing: false,
  };
}

function patchValuesFromDefaults(values: VerticalValues, defaults: VerticalDefaults, params: URLSearchParams): VerticalValues {
  return {
    cameraMode: params.has("camera") ? values.cameraMode : defaults.cameraMode,
    altitude: params.has("altitude") ? values.altitude : defaults.altitude,
    shipSize: params.has("shipSize") ? values.shipSize : defaults.shipSize,
    ground: params.has("ground") ? values.ground : defaults.ground,
    groundTile: params.has("tile") ? values.groundTile : defaults.groundTile,
    tileRepeat: params.has("tileRepeat") ? values.tileRepeat : defaults.tileRepeat,
    pixelLevel: params.has("pixel") ? values.pixelLevel : defaults.pixelLevel,
    pipelineMode: params.has("pipe") ? values.pipelineMode : defaults.pipelineMode,
    rtHeight: params.has("rth") ? values.rtHeight : defaults.rtHeight,
    lighting: params.has("lighting") ? values.lighting : defaults.lighting,
    sunI: params.has("sun") ? values.sunI : defaults.sunI,
    skyI: params.has("sky") ? values.skyI : defaults.skyI,
    azimuth: params.has("angle") ? values.azimuth : defaults.azimuth,
    elevation: params.has("height") ? values.elevation : defaults.elevation,
    shipLight: hasShipLightHash(params) ? values.shipLight : { ...defaults.shipLight },
  };
}

function getDefaultShipSize(
  playerShipUrl: string | null,
  shipSizeByModel: Record<string, number>,
  savedDefaults: VerticalDefaults
) {
  if (playerShipUrl) {
    const remembered = shipSizeByModel[playerShipUrl];
    if (remembered != null) return remembered;
  }
  return savedDefaults.shipSize;
}

export type VerticalAction =
  | { type: "hydrate-defaults"; defaults: VerticalDefaults; hashParams: URLSearchParams }
  | { type: "set-player-ship-url"; url: string; respectHashShipSize: boolean }
  | { type: "set-save-stamp"; stamp: VerticalScrollerState["saveStamp"] }
  | { type: "toggle-left"; id: string }
  | { type: "toggle-right"; id: string }
  | { type: "set-camera-mode"; mode: CameraRotationMode }
  | { type: "set-altitude"; altitude: number }
  | { type: "set-ground"; ground: GroundStyle }
  | { type: "set-ground-tile"; tile: string | null }
  | { type: "set-tile-repeat"; repeat: number }
  | { type: "set-pixel-level"; pixelLevel: number }
  | { type: "set-pipeline-mode"; mode: PipelineMode }
  | { type: "set-rt-height"; h: number }
  | { type: "set-lighting-preset"; lighting: LightingPreset }
  | { type: "sync-lighting-from-scene"; sunI: number; skyI: number; azimuth: number; elevation: number }
  | { type: "set-ship-size"; shipSize: number }
  | { type: "set-ship-light"; patch: Partial<ShipLightingState> }
  | { type: "select-zone"; index: number }
  | { type: "add-zone" }
  | { type: "remove-zone"; index: number }
  | { type: "rename-zone"; index: number; name: string }
  | { type: "set-scenery"; scenery: string }
  | { type: "set-zone-length"; index: number; lengthSec: number }
  | { type: "set-blend"; blendSec: number }
  | { type: "set-playing"; playing: boolean }
  | { type: "reset-to-defaults" }
  | { type: "save-defaults-locally"; defaults: VerticalDefaults };

export function verticalScrollerReducer(
  state: VerticalScrollerState,
  action: VerticalAction
): VerticalScrollerState {
  switch (action.type) {
    case "hydrate-defaults": {
      const { defaults, hashParams } = action;
      const values = patchValuesFromDefaults(state.values, defaults, hashParams);
      const resolvedShipSize = hashParams.has("shipSize")
        ? values.shipSize
        : getDefaultShipSize(state.playerShipUrl, defaults.shipSizeByModel, defaults);
      const zones = defaults.zones;
      return {
        ...state,
        hydrated: true,
        savedDefaults: defaults,
        shipSizeByModel: defaults.shipSizeByModel,
        zones,
        selectedZone: 0,
        blendSec: defaults.blendSec,
        values: {
          ...values,
          shipSize: resolvedShipSize,
          // the live look mirrors the selected zone so the panels + scene agree
          ...zoneToLook(zones[0]),
        },
      };
    }
    case "set-player-ship-url": {
      if (state.playerShipUrl === action.url) return state;
      const nextShipSize = action.respectHashShipSize
        ? state.values.shipSize
        : getDefaultShipSize(action.url, state.shipSizeByModel, state.savedDefaults);
      return {
        ...state,
        playerShipUrl: action.url,
        values: {
          ...state.values,
          shipSize: nextShipSize,
        },
      };
    }
    case "set-save-stamp":
      return { ...state, saveStamp: action.stamp };
    case "toggle-left":
      return { ...state, openLeft: state.openLeft === action.id ? "" : action.id };
    case "toggle-right":
      return { ...state, openRight: state.openRight === action.id ? "" : action.id };
    case "set-camera-mode":
      return { ...state, values: { ...state.values, cameraMode: action.mode } };
    case "set-altitude":
      return { ...state, values: { ...state.values, altitude: action.altitude } };
    case "set-ground":
      // Picking a procedural style implicitly drops out of pixel-tile mode so
      // the procedural style is actually visible (the scene reverts too).
      return patchLook(state, { ground: action.ground, groundTile: null });
    case "set-ground-tile": {
      // Switching tiles also resets the Repeat slider to the new tile's
      // recommended starting point (pixel tiles want ~32 repeats across the
      // ground, photoreal tiles want ~6). User can still drag from there.
      const tile = findTile(action.tile);
      return patchLook(state, {
        groundTile: action.tile,
        tileRepeat: tile ? tile.defaultRepeat : state.values.tileRepeat,
      });
    }
    case "set-tile-repeat":
      return patchLook(state, { tileRepeat: action.repeat });
    case "set-pixel-level":
      return { ...state, values: { ...state.values, pixelLevel: action.pixelLevel } };
    case "set-pipeline-mode":
      return { ...state, values: { ...state.values, pipelineMode: action.mode } };
    case "set-rt-height":
      return { ...state, values: { ...state.values, rtHeight: action.h } };
    case "set-lighting-preset": {
      // A preset seeds the sun sliders from its baseline (pure — no scene round
      // trip), then write-through stores the result on the selected zone.
      const s = presetSunDefaults(action.lighting);
      return patchLook(state, {
        lighting: action.lighting,
        sunI: s.sunI,
        skyI: s.skyI,
        azimuth: s.azimuth,
        elevation: s.elevation,
      });
    }
    case "sync-lighting-from-scene":
      return patchLook(state, {
        sunI: action.sunI,
        skyI: action.skyI,
        azimuth: action.azimuth,
        elevation: action.elevation,
      });
    case "set-ship-size": {
      const shipSizeByModel = state.playerShipUrl
        ? {
            ...state.shipSizeByModel,
            [state.playerShipUrl]: action.shipSize,
          }
        : state.shipSizeByModel;
      return {
        ...state,
        shipSizeByModel,
        values: { ...state.values, shipSize: action.shipSize },
      };
    }
    case "set-ship-light":
      // ship lighting is zone-owned now — write through to the selected zone
      return patchLook(state, {
        shipLight: { ...state.values.shipLight, ...action.patch },
      });
    case "select-zone": {
      const z = state.zones[action.index];
      if (!z) return state;
      return {
        ...state,
        selectedZone: action.index,
        values: { ...state.values, ...zoneToLook(z) },
      };
    }
    case "add-zone": {
      // duplicate the selected zone so you start from a known look, insert it
      // right after, and select it for editing
      const src = state.zones[state.selectedZone] ?? DEFAULT_ZONES[0];
      const clone: ZoneLook = { ...src, id: newZoneId(), name: `${src.name} copy` };
      const zones = [...state.zones];
      zones.splice(state.selectedZone + 1, 0, clone);
      const selectedZone = state.selectedZone + 1;
      return { ...state, zones, selectedZone, values: { ...state.values, ...zoneToLook(clone) } };
    }
    case "remove-zone": {
      if (state.zones.length <= 1) return state; // always keep at least one zone
      const zones = state.zones.filter((_, i) => i !== action.index);
      const selectedZone = Math.min(state.selectedZone, zones.length - 1);
      return {
        ...state,
        zones,
        selectedZone,
        values: { ...state.values, ...zoneToLook(zones[selectedZone]) },
      };
    }
    case "rename-zone":
      return {
        ...state,
        zones: state.zones.map((z, i) => (i === action.index ? { ...z, name: action.name } : z)),
      };
    case "set-scenery":
      // scenery edits the selected zone (like Ground/Lighting)
      return {
        ...state,
        zones: state.zones.map((z, i) =>
          i === state.selectedZone ? { ...z, scenery: action.scenery } : z,
        ),
      };
    case "set-zone-length":
      return {
        ...state,
        zones: state.zones.map((z, i) =>
          i === action.index ? { ...z, lengthSec: action.lengthSec } : z,
        ),
      };
    case "set-blend":
      return { ...state, blendSec: action.blendSec };
    case "set-playing":
      return { ...state, playing: action.playing };
    case "reset-to-defaults": {
      const zones = state.savedDefaults.zones;
      return {
        ...state,
        shipSizeByModel: state.savedDefaults.shipSizeByModel,
        zones,
        selectedZone: 0,
        blendSec: state.savedDefaults.blendSec,
        playing: false,
        values: {
          cameraMode: state.savedDefaults.cameraMode,
          altitude: state.savedDefaults.altitude,
          shipSize: getDefaultShipSize(state.playerShipUrl, state.savedDefaults.shipSizeByModel, state.savedDefaults),
          pixelLevel: state.savedDefaults.pixelLevel,
          pipelineMode: state.savedDefaults.pipelineMode,
          rtHeight: state.savedDefaults.rtHeight,
          // ground + lighting + ship-light look comes from the (restored) first zone
          ...zoneToLook(zones[0]),
        },
      };
    }
    case "save-defaults-locally":
      return {
        ...state,
        savedDefaults: action.defaults,
      };
    default:
      return state;
  }
}

export function serializeVerticalHash(values: VerticalValues) {
  const params = new URLSearchParams();
  params.set("camera", values.cameraMode);
  params.set("altitude", values.altitude.toFixed(2));
  params.set("shipSize", values.shipSize.toFixed(2));
  params.set("ground", values.ground);
  if (values.groundTile != null) params.set("tile", values.groundTile);
  params.set("tileRepeat", String(values.tileRepeat));
  params.set("pixel", String(values.pixelLevel));
  params.set("pipe", values.pipelineMode);
  params.set("rth", String(values.rtHeight));
  params.set("lighting", values.lighting);
  params.set("sun", values.sunI.toFixed(2));
  params.set("sky", values.skyI.toFixed(2));
  params.set("angle", String(Math.round(values.azimuth)));
  params.set("height", String(Math.round(values.elevation)));
  params.set("shipDirect", values.shipLight.directIntensity.toFixed(2));
  params.set("shipEnv", values.shipLight.environmentIntensity.toFixed(2));
  params.set("shipRough", values.shipLight.roughness.toFixed(2));
  params.set("shipSpec", values.shipLight.specularIntensity.toFixed(2));
  params.set("shipExposure", values.shipLight.exposure.toFixed(2));
  params.set("shipContrast", values.shipLight.contrast.toFixed(2));
  params.set("shipAlbedo", values.shipLight.albedoBoost.toFixed(2));
  params.set("shipAmbient", values.shipLight.ambientStrength.toFixed(2));
  return `#vertical?${params.toString()}`;
}

export function buildDefaultsFromState(state: VerticalScrollerState): VerticalDefaults {
  return {
    ...state.values,
    shipLight: { ...state.values.shipLight },
    shipSizeByModel: state.shipSizeByModel,
    zones: state.zones,
    blendSec: state.blendSec,
  };
}
