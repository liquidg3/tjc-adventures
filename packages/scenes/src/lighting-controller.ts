import {
  Color3,
  Color4,
  DirectionalLight,
  HemisphericLight,
  ShadowGenerator,
  Vector3,
  type Scene,
} from "@babylonjs/core";
import { LIGHTING, type LightingPreset } from "./scene-config";

/** A fully concrete lighting state — what the sequencer lerps between. */
export interface ResolvedLighting {
  azimuth: number;
  elevation: number;
  sunI: number;
  sunC: [number, number, number];
  skyI: number;
  skyC: [number, number, number];
  groundC: [number, number, number];
  clear: [number, number, number];
  shadowDark: number;
}

export interface LightingController {
  sun: DirectionalLight;
  sky: HemisphericLight;
  shadowGen: ShadowGenerator;
  applyPreset: (preset: LightingPreset) => void;
  setSunIntensity: (v: number) => void;
  setSkyIntensity: (v: number) => void;
  setSunAzimuth: (deg: number) => void;
  setSunElevation: (deg: number) => void;
  getLightingState: () => {
    sunIntensity: number;
    skyIntensity: number;
    azimuth: number;
    elevation: number;
  };
  /** Resolve a preset + sun overrides into a concrete lighting state (colors
   *  come from the preset; intensity/angle from the overrides). */
  resolve: (
    preset: LightingPreset,
    overrides: { sunI: number; skyI: number; azimuth: number; elevation: number },
  ) => ResolvedLighting;
  /** Apply a concrete lighting state outright (used by the zone sequencer). */
  applyResolved: (r: ResolvedLighting) => void;
}

export function createLightingController(scene: Scene): LightingController {
  const sun = new DirectionalLight("sun", new Vector3(-0.05, -1, 0.05), scene);
  sun.position = new Vector3(40, 200, -40);
  const sky = new HemisphericLight("sky", new Vector3(0, 1, 0), scene);
  const shadowGen = new ShadowGenerator(2048, sun);
  shadowGen.useBlurExponentialShadowMap = true;
  shadowGen.blurKernel = 48;
  shadowGen.bias = 0.0005;
  shadowGen.normalBias = 0.02;

  let sunAz = 0;
  let sunEl = 75;

  function applySunAngles() {
    const a = (sunAz * Math.PI) / 180;
    const e = (sunEl * Math.PI) / 180;
    const ce = Math.cos(e);
    const dir = new Vector3(-ce * Math.sin(a), -Math.sin(e), -ce * Math.cos(a));
    sun.direction = dir;
    sun.position = dir.scale(-400);
  }

  function applyPreset(preset: LightingPreset) {
    const p = LIGHTING[preset];
    const d = new Vector3(p.sun[0], p.sun[1], p.sun[2]);
    d.normalize();
    sunEl = (Math.asin(clamp(-d.y, -1, 1)) * 180) / Math.PI;
    sunAz = (Math.atan2(-d.x, -d.z) * 180) / Math.PI;
    applySunAngles();
    sun.intensity = p.sunI;
    sun.diffuse = Color3.FromArray(p.sunC);
    sky.intensity = p.skyI;
    sky.diffuse = Color3.FromArray(p.skyC);
    sky.groundColor = Color3.FromArray(p.groundC);
    scene.clearColor = new Color4(p.clear[0], p.clear[1], p.clear[2], 1);
    shadowGen.setDarkness(p.shadowDark);
  }

  return {
    sun,
    sky,
    shadowGen,
    applyPreset,
    setSunIntensity(v) {
      sun.intensity = v;
    },
    setSkyIntensity(v) {
      sky.intensity = v;
    },
    setSunAzimuth(deg) {
      sunAz = deg;
      applySunAngles();
    },
    setSunElevation(deg) {
      sunEl = deg;
      applySunAngles();
    },
    getLightingState() {
      return {
        sunIntensity: sun.intensity,
        skyIntensity: sky.intensity,
        azimuth: ((sunAz % 360) + 360) % 360,
        elevation: sunEl,
      };
    },
    resolve(preset, o) {
      const p = LIGHTING[preset];
      return {
        azimuth: o.azimuth,
        elevation: o.elevation,
        sunI: o.sunI,
        sunC: p.sunC,
        skyI: o.skyI,
        skyC: p.skyC,
        groundC: p.groundC,
        clear: p.clear,
        shadowDark: p.shadowDark,
      };
    },
    applyResolved(r) {
      sunAz = r.azimuth;
      sunEl = r.elevation;
      applySunAngles();
      sun.intensity = r.sunI;
      sun.diffuse = Color3.FromArray(r.sunC);
      sky.intensity = r.skyI;
      sky.diffuse = Color3.FromArray(r.skyC);
      sky.groundColor = Color3.FromArray(r.groundC);
      scene.clearColor = new Color4(r.clear[0], r.clear[1], r.clear[2], 1);
      shadowGen.setDarkness(r.shadowDark);
    },
  };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
