import {
  ArcRotateCamera,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  MultiMaterial,
  Scene,
  SceneLoader,
  Vector3,
  type AbstractMesh,
  type Material,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF"; // registers the .glb / .gltf loader

/**
 * Offscreen one-shot thumbnail renderer for GLB models.
 *
 * Exactly ONE Babylon engine (= one WebGL context, see the context-cap gotcha)
 * services a sequential queue: load the model into a throwaway scene, frame it
 * isometrically, render a single frame, capture a transparent PNG data-URL, and
 * cache it by URL for the rest of the session. The engine is disposed after a
 * short idle so it doesn't hold a context while nothing is rendering.
 */

const THUMB_SIZE = 96;
const IDLE_DISPOSE_MS = 4000;
const FIT_MARGIN = 1.25;

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
let queue: Promise<void> = Promise.resolve();
let engine: Engine | null = null;
let canvas: HTMLCanvasElement | null = null;
let idleTimer: number | null = null;

/** Synchronous cache hit — lets tiles render an already-built thumb without a flash. */
export function peekModelThumbnail(url: string): string | null {
  return cache.get(url) ?? null;
}

export function getModelThumbnail(url: string): Promise<string> {
  const hit = cache.get(url);
  if (hit) return Promise.resolve(hit);
  const inFlight = pending.get(url);
  if (inFlight) return inFlight;

  const p = new Promise<string>((resolve, reject) => {
    queue = queue.then(async () => {
      try {
        const dataUrl = await renderThumbnail(url);
        cache.set(url, dataUrl);
        resolve(dataUrl);
      } catch (err) {
        reject(err);
      } finally {
        pending.delete(url);
        scheduleIdleDispose();
      }
    });
  });
  pending.set(url, p);
  return p;
}

function ensureEngine(): Engine {
  if (idleTimer != null) {
    window.clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (engine) return engine;
  canvas = document.createElement("canvas");
  canvas.width = THUMB_SIZE;
  canvas.height = THUMB_SIZE;
  // preserveDrawingBuffer so toDataURL right after render() captures the frame.
  engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
  return engine;
}

function scheduleIdleDispose() {
  if (idleTimer != null) window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    idleTimer = null;
    if (pending.size > 0) return;
    engine?.dispose();
    engine = null;
    canvas = null;
  }, IDLE_DISPOSE_MS);
}

async function renderThumbnail(url: string): Promise<string> {
  const eng = ensureEngine();
  const scene = new Scene(eng);
  try {
    scene.clearColor = new Color4(0, 0, 0, 0);
    const camera = new ArcRotateCamera(
      "thumb-cam",
      -Math.PI / 4,
      Math.PI / 3,
      6,
      Vector3.Zero(),
      scene,
    );
    const hemi = new HemisphericLight("thumb-hemi", new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.9;
    const dir = new DirectionalLight("thumb-dir", new Vector3(-1, -2, -1), scene);
    dir.intensity = 1.0;

    const res = await SceneLoader.ImportMeshAsync("", "", url, scene);
    flattenPbr(res.meshes);

    const bounds = worldBounds(res.meshes);
    if (bounds) {
      const center = Vector3.Center(bounds.min, bounds.max);
      const size = bounds.max.subtract(bounds.min).length() || 2;
      camera.setTarget(center);
      camera.radius = size * FIT_MARGIN;
      camera.minZ = Math.max(0.01, size * 0.01);
    }

    await scene.whenReadyAsync();
    scene.render();
    return canvas!.toDataURL("image/png");
  } finally {
    scene.dispose();
  }
}

function worldBounds(meshes: AbstractMesh[]): { min: Vector3; max: Vector3 } | null {
  let min = new Vector3(Infinity, Infinity, Infinity);
  let max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const m of meshes) {
    if (m.getTotalVertices() <= 0) continue;
    m.computeWorldMatrix(true);
    const info = m.getBoundingInfo?.();
    if (!info) continue;
    min = Vector3.Minimize(min, info.boundingBox.minimumWorld);
    max = Vector3.Maximize(max, info.boundingBox.maximumWorld);
  }
  return isFinite(min.x) ? { min, max } : null;
}

// glTF PBR renders dark without an HDR/IBL environment (repo gotcha) — force
// materials matte so the two analytic lights catch them.
function flattenPbr(meshes: AbstractMesh[]) {
  type FlatMaterial = Material & { metallic?: number; roughness?: number };
  for (const mesh of meshes) {
    const mat = mesh.material;
    if (!mat) continue;
    const subs = mat instanceof MultiMaterial ? mat.subMaterials : [mat];
    for (const sm of subs) {
      if (!sm) continue;
      const m = sm as FlatMaterial;
      if ("metallic" in m) m.metallic = 0;
      if ("roughness" in m) m.roughness = 1;
    }
  }
}
