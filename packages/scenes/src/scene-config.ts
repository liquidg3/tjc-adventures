export const SHIP_SPEED = 50;
export const BOOST_MULT = 2.2;
export const SCROLL = 16;
export const FIELD_DEPTH = 800;
export const SHIP_YAW = 0;
export const SHIP_HEIGHT = 100;
export const SHIP_SIZE = 2.3;
export const SHIP_START_Z = 50;
export const SHIP_BANK_MAX = 0.4;
export const CAMERA_BASE_LOCAL_X = -0.3;
export const CAMERA_TEST_ROT = 0.35;
export const CAMERA_Z_ROT = 0.02;
export const CAMERA_ROT_LERP = 4;
export const DEFAULT_SHIP_MODEL_URL = "/models/ships/ship_classic.glb";

export interface ShipLightingState {
  directIntensity: number;
  environmentIntensity: number;
  roughness: number;
  specularIntensity: number;
  exposure: number;
  contrast: number;
  albedoBoost: number;
  ambientStrength: number;
}

export interface SceneHandle {
  dispose: () => void;
  setCameraRotationMode: (mode: CameraRotationMode) => void;
  setPlayerShipModel: (url: string) => void;
  setShipHeight: (height: number) => void;
  setShipSize: (size: number) => void;
  getShipPosition: () => { x: number; y: number; z: number } | null;
  resetShip: () => void;
  setGroundStyle: (style: GroundStyle) => void;
  setGroundTile: (
    url: string | null,
    repeatPerSide: number,
    sampling?: TileSampling,
  ) => void;
  setPixelScale: (level: number) => void;
  setPipelineMode: (mode: PipelineMode) => void;
  setRtHeight: (h: number) => void;
  setLightingPreset: (preset: LightingPreset) => void;
  setSunIntensity: (v: number) => void;
  setSkyIntensity: (v: number) => void;
  setSunAzimuth: (deg: number) => void;
  setSunElevation: (deg: number) => void;
  setShipLightDirectIntensity: (v: number) => void;
  setShipLightEnvironmentIntensity: (v: number) => void;
  setShipLightRoughness: (v: number) => void;
  setShipLightSpecularIntensity: (v: number) => void;
  setShipLightExposure: (v: number) => void;
  setShipLightContrast: (v: number) => void;
  setShipLightAlbedoBoost: (v: number) => void;
  setShipLightAmbientStrength: (v: number) => void;
  getShipLightingState: () => ShipLightingState;
  getLightingState: () => {
    sunIntensity: number;
    skyIntensity: number;
    azimuth: number;
    elevation: number;
  };
}

export type CameraRotationMode =
  | "none"
  | "camera-x"
  | "camera-y"
  | "camera-z"
  | "rig-x"
  | "rig-y"
  | "rig-z";

export type GroundStyle = "painterly" | "flat" | "stripes" | "checker";

/**
 * How the ground tile texture is sampled.
 * - "nearest"   : pixel-art tiles; preserves every texel as a square.
 * - "trilinear" : photoreal / painterly textures; smooth bilinear-with-mips
 *                 (avoids ugly aliasing on photo content as the camera tilts).
 */
export type TileSampling = "nearest" | "trilinear";

/**
 * Render pipeline for the pixel-art aesthetic spike.
 * - "direct"            : render at native canvas resolution (no pixelation).
 * - "low-res-nearest"   : render to a low-res buffer; browser upscales with
 *                         image-rendering: pixelated (crisp pixel-art).
 * - "low-res-bilinear"  : same low-res render, but browser upscales bilinearly
 *                         (the current "blurry" reading — kept as A/B baseline).
 */
export type PipelineMode = "direct" | "low-res-nearest" | "low-res-bilinear";

export type LightingPreset = "noon" | "golden" | "overcast" | "dramatic" | "moonlit";

export interface LightingDef {
  sun: [number, number, number];
  sunI: number;
  sunC: [number, number, number];
  skyI: number;
  skyC: [number, number, number];
  groundC: [number, number, number];
  clear: [number, number, number];
  shadowDark: number;
}

export const LIGHTING: Record<LightingPreset, LightingDef> = {
  noon: { sun: [-0.05, -1, 0.05], sunI: 2.0, sunC: [1, 0.97, 0.9], skyI: 1.2, skyC: [0.85, 0.9, 1.0], groundC: [0.3, 0.4, 0.3], clear: [0.46, 0.62, 0.85], shadowDark: 0.45 },
  golden: { sun: [-0.5, -0.6, 0.45], sunI: 2.6, sunC: [1, 0.82, 0.55], skyI: 0.6, skyC: [1, 0.85, 0.68], groundC: [0.35, 0.28, 0.2], clear: [0.95, 0.72, 0.48], shadowDark: 0.35 },
  overcast: { sun: [-0.1, -1, 0.1], sunI: 0.7, sunC: [0.92, 0.94, 0.96], skyI: 1.7, skyC: [0.86, 0.89, 0.93], groundC: [0.5, 0.54, 0.5], clear: [0.72, 0.76, 0.8], shadowDark: 0.7 },
  dramatic: { sun: [-0.098, -0.998, 0.036], sunI: 2.8, sunC: [1, 0.95, 0.85], skyI: 0.2, skyC: [0.5, 0.6, 0.8], groundC: [0.12, 0.16, 0.18], clear: [0.16, 0.24, 0.4], shadowDark: 0.2 },
  moonlit: { sun: [-0.2, -0.9, 0.18], sunI: 0.8, sunC: [0.6, 0.72, 1.0], skyI: 0.5, skyC: [0.4, 0.5, 0.8], groundC: [0.15, 0.2, 0.32], clear: [0.06, 0.09, 0.18], shadowDark: 0.3 },
};

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
