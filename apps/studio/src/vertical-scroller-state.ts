import {
  SHIP_HEIGHT,
  SHIP_SIZE,
  type CameraRotationMode,
  type GroundStyle,
  type LightingPreset,
  type PipelineMode,
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

export interface VerticalDefaults extends VerticalValues {
  shipSizeByModel: Record<string, number>;
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
      return {
        ...state,
        hydrated: true,
        savedDefaults: defaults,
        shipSizeByModel: defaults.shipSizeByModel,
        values: {
          ...values,
          shipSize: resolvedShipSize,
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
      return {
        ...state,
        values: { ...state.values, ground: action.ground, groundTile: null },
      };
    case "set-ground-tile": {
      // Switching tiles also resets the Repeat slider to the new tile's
      // recommended starting point (pixel tiles want ~32 repeats across the
      // ground, photoreal tiles want ~6). User can still drag from there.
      const tile = findTile(action.tile);
      return {
        ...state,
        values: {
          ...state.values,
          groundTile: action.tile,
          tileRepeat: tile ? tile.defaultRepeat : state.values.tileRepeat,
        },
      };
    }
    case "set-tile-repeat":
      return { ...state, values: { ...state.values, tileRepeat: action.repeat } };
    case "set-pixel-level":
      return { ...state, values: { ...state.values, pixelLevel: action.pixelLevel } };
    case "set-pipeline-mode":
      return { ...state, values: { ...state.values, pipelineMode: action.mode } };
    case "set-rt-height":
      return { ...state, values: { ...state.values, rtHeight: action.h } };
    case "set-lighting-preset":
      return { ...state, values: { ...state.values, lighting: action.lighting } };
    case "sync-lighting-from-scene":
      return {
        ...state,
        values: {
          ...state.values,
          sunI: action.sunI,
          skyI: action.skyI,
          azimuth: action.azimuth,
          elevation: action.elevation,
        },
      };
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
      return {
        ...state,
        values: {
          ...state.values,
          shipLight: { ...state.values.shipLight, ...action.patch },
        },
      };
    case "reset-to-defaults":
      return {
        ...state,
        shipSizeByModel: state.savedDefaults.shipSizeByModel,
        values: {
          cameraMode: state.savedDefaults.cameraMode,
          altitude: state.savedDefaults.altitude,
          shipSize: getDefaultShipSize(state.playerShipUrl, state.savedDefaults.shipSizeByModel, state.savedDefaults),
          ground: state.savedDefaults.ground,
          groundTile: state.savedDefaults.groundTile,
          tileRepeat: state.savedDefaults.tileRepeat,
          pixelLevel: state.savedDefaults.pixelLevel,
          pipelineMode: state.savedDefaults.pipelineMode,
          rtHeight: state.savedDefaults.rtHeight,
          lighting: state.savedDefaults.lighting,
          sunI: state.savedDefaults.sunI,
          skyI: state.savedDefaults.skyI,
          azimuth: state.savedDefaults.azimuth,
          elevation: state.savedDefaults.elevation,
          shipLight: { ...state.savedDefaults.shipLight },
        },
      };
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
  };
}
