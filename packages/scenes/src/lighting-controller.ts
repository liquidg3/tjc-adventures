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
  };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
