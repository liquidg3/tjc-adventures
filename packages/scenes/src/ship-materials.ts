import {
  Color3,
  PBRMaterial,
  Scene,
  SceneLoader,
  type AbstractMesh,
  type Material,
} from "@babylonjs/core";
import { dbgError } from "./debug";
import type { ShipLightingState } from "./scene-config";

export interface ShipMaterialEntry {
  mat: MaterialLike;
  baseColor: Color3;
}

type MaterialLike = Material & {
  disableLighting?: boolean;
  unlit?: boolean;
  metallic?: number;
  roughness?: number;
  directIntensity?: number;
  environmentIntensity?: number;
  specularIntensity?: number;
  cameraExposure?: number;
  cameraContrast?: number;
  forceIrradianceInFragment?: boolean;
  ambientTextureStrength?: number;
  microSurface?: number;
  ambientColor?: Color3;
  specularPower?: number;
  specularColor?: Color3;
  diffuseColor?: Color3;
  albedoColor?: Color3;
};

export async function loadModel(url: string, scene: Scene): Promise<AbstractMesh | null> {
  try {
    const res = await SceneLoader.ImportMeshAsync("", "", url, scene);
    for (const mesh of res.meshes) {
      const mat = mesh.material as MaterialLike | null;
      if (mat) tuneImportedMaterial(mat);
    }
    const root = (res.meshes.find((mesh) => !mesh.parent) ?? res.meshes[0]) as AbstractMesh;
    return root ?? null;
  } catch (err) {
    dbgError("model load failed", url, err);
    return null;
  }
}

export async function loadRawModel(url: string, scene: Scene): Promise<AbstractMesh | null> {
  try {
    const res = await SceneLoader.ImportMeshAsync("", "", url, scene);
    const root = (res.meshes.find((mesh) => !mesh.parent) ?? res.meshes[0]) as AbstractMesh;
    return root ?? null;
  } catch (err) {
    dbgError("model load failed", url, err);
    return null;
  }
}

export function fitScale(root: AbstractMesh, targetHeight: number): number {
  const { min, max } = root.getHierarchyBoundingVectors(true);
  const h = max.y - min.y || 1;
  return targetHeight / h;
}

export function collectShipMaterials(root: AbstractMesh): ShipMaterialEntry[] {
  const out: ShipMaterialEntry[] = [];
  const seen = new Set<MaterialLike>();
  const meshes = [root, ...root.getChildMeshes(false)];
  for (const mesh of meshes) {
    const mat = mesh.material as MaterialLike | null;
    if (!mat || seen.has(mat)) continue;
    seen.add(mat);
    const baseColor =
      mat instanceof PBRMaterial
        ? mat.albedoColor?.clone?.() ?? Color3.White()
        : mat.diffuseColor?.clone?.() ?? Color3.White();
    out.push({ mat, baseColor });
  }
  return out;
}

export function applyShipLighting(materials: ShipMaterialEntry[], state: ShipLightingState) {
  for (const entry of materials) {
    const { mat, baseColor } = entry;
    if ("disableLighting" in mat) mat.disableLighting = false;
    if ("unlit" in mat) mat.unlit = false;

    if (mat instanceof PBRMaterial) {
      mat.metallic = 0;
      mat.roughness = state.roughness;
      mat.directIntensity = state.directIntensity;
      mat.environmentIntensity = state.environmentIntensity;
      mat.specularIntensity = state.specularIntensity;
      mat.cameraExposure = state.exposure;
      mat.cameraContrast = state.contrast;
      mat.forceIrradianceInFragment = true;
      mat.albedoColor = baseColor.scale(state.albedoBoost);
      mat.ambientTextureStrength = state.ambientStrength;
      mat.microSurface = clamp(1 - state.roughness * 0.6, 0.15, 1);
      continue;
    }

    if (mat.diffuseColor) mat.diffuseColor = baseColor.scale(state.albedoBoost);
    if (mat.ambientColor) {
      mat.ambientColor = new Color3(state.ambientStrength, state.ambientStrength, state.ambientStrength);
    }
    if (mat.specularColor) {
      const s = clamp(state.specularIntensity * 0.25, 0, 1);
      mat.specularColor = new Color3(s, s, s);
    }
    if (typeof mat.specularPower === "number") mat.specularPower = 64 + state.specularIntensity * 64;
  }
}

function tuneImportedMaterial(mat: MaterialLike) {
  if ("disableLighting" in mat) mat.disableLighting = false;
  if ("unlit" in mat) mat.unlit = false;
  if (mat instanceof PBRMaterial) {
    mat.metallic = 0;
    mat.roughness = 0.7;
    mat.directIntensity = 1.6;
    mat.environmentIntensity = 0.2;
    mat.specularIntensity = 1;
    mat.cameraExposure = 1;
    mat.cameraContrast = 1;
    mat.forceIrradianceInFragment = true;
    mat.ambientTextureStrength = 0.3;
    mat.microSurface = 0.7;
    return;
  }
  if (typeof mat.metallic === "number") {
    mat.metallic = 0;
    mat.roughness = 0.7;
    mat.directIntensity = 1.6;
    mat.environmentIntensity = 0.2;
    mat.specularIntensity = 1;
  }
  mat.ambientColor = new Color3(0.14, 0.14, 0.14);
  mat.specularPower = 64;
  mat.specularColor = new Color3(0.25, 0.25, 0.25);
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
