import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  DirectionalLight,
  Vector3,
  Color3,
  Color4,
  TransformNode,
  MeshBuilder,
  MultiMaterial,
  StandardMaterial,
  SceneLoader,
  Texture,
  type Mesh,
  type AbstractMesh,
  type Material,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF"; // registers the .glb / .gltf loader
import type { AssetNormalization } from "./asset-normalization";

export type ShipVariant = "interceptor" | "hauler" | "scout";
export type ViewerCameraView = "isometric" | "top" | "front" | "side";

export interface ViewerOptions {
  modelUrl?: string;
  variant?: ShipVariant;
  pixelate?: boolean;
  spin?: boolean;
  bg?: string;
  showPivotMarker?: boolean;
  showForwardMarker?: boolean;
  /** Apply this texture to all loaded materials (a shared atlas, if a pack uses one). */
  atlasUrl?: string;
  /** Extra orientation (degrees, XYZ) applied to the loaded model. */
  orient?: [number, number, number];
  /** Preset normalization applied under the turntable spin. */
  normalization?: AssetNormalization;
  view?: ViewerCameraView;
  lockTargetToPivot?: boolean;
  wheelZoomOnly?: boolean;
  spinSpeed?: number;
}

export interface ViewerHandle {
  dispose: () => void;
  setPixelate: (on: boolean) => void;
  setSpin: (on: boolean) => void;
  setView: (view: ViewerCameraView) => void;
  /** Live-update the model orientation (degrees, XYZ) — for dialing in fixes. */
  setOrient: (x: number, y: number, z: number) => void;
  onStatus?: (cb: (msg: string) => void) => void;
}

/** A self-contained orbit-preview of one asset (GLB model or placeholder ship). */
export function createViewer(
  canvas: HTMLCanvasElement,
  opts: ViewerOptions,
  onStatus?: (msg: string) => void
): ViewerHandle {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: false });
  const scene = new Scene(engine);
  scene.clearColor = hexToColor4(opts.bg ?? "#0b1020");

  const camera = new ArcRotateCamera("cam", -Math.PI / 2, Math.PI / 2.4, 6, Vector3.Zero(), scene);
  camera.lowerRadiusLimit = 1.5;
  camera.upperRadiusLimit = 80;
  let view: ViewerCameraView = opts.view ?? "top";
  const lockTargetToPivot = opts.lockTargetToPivot ?? false;

  if (opts.wheelZoomOnly) {
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const nextRadius = camera.radius * (1 + event.deltaY * 0.0015);
      camera.radius = clamp(
        nextRadius,
        camera.lowerRadiusLimit ?? 0.01,
        camera.upperRadiusLimit ?? Number.POSITIVE_INFINITY,
      );
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    scene.onDisposeObservable.add(() => canvas.removeEventListener("wheel", onWheel));
  } else {
    camera.attachControl(canvas, true);
    camera.wheelDeltaPercentage = 0.01;
    camera.panningSensibility = 0;
  }

  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.85;
  const dir = new DirectionalLight("dir", new Vector3(-1, -2, -1), scene);
  dir.intensity = 1.1;

  const pivot = new TransformNode("pivot", scene);
  const content = new TransformNode("content", scene);
  content.parent = pivot;
  let spin = opts.spin ?? true;
  const spinSpeed = opts.spinSpeed ?? 0.6;
  let loaded: AbstractMesh[] = [];

  // orientation applied to the loaded model (separate from the turntable spin on
  // the pivot), so it can be dialed live to find a pack's correct rotation
  let modelRoot: AbstractMesh | null = null;
  const orient: [number, number, number] = opts.orient ? [...opts.orient] : [0, 0, 0];
  const normalization =
    opts.normalization ?? { orient: [0, 0, 0], offset: [0, 0, 0], anchor: "center", fitMargin: 1.5 };
  const d2r = (d: number) => (d * Math.PI) / 180;

  if (opts.showPivotMarker) buildPivotMarker();
  if (opts.showForwardMarker) buildForwardMarker();

  function applyOrient() {
    if (!modelRoot) return;
    modelRoot.rotation = new Vector3(
      d2r(normalization.orient[0] + orient[0]),
      d2r(normalization.orient[1] + orient[1]),
      d2r(normalization.orient[2] + orient[2]),
    );
  }

  function getWorldBounds() {
    let min = new Vector3(Infinity, Infinity, Infinity);
    let max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const m of loaded) {
      m.computeWorldMatrix(true);
      const info = m.getBoundingInfo?.();
      if (!info) continue;
      min = Vector3.Minimize(min, info.boundingBox.minimumWorld);
      max = Vector3.Maximize(max, info.boundingBox.maximumWorld);
    }
    return isFinite(min.x) ? { min, max } : null;
  }

  function normalizeContent() {
    const bounds = getWorldBounds();
    if (!bounds) return;
    const center = Vector3.Center(bounds.min, bounds.max);
    const anchor =
      normalization.anchor === "bottom-center"
        ? new Vector3(center.x, bounds.min.y, center.z)
        : normalization.anchor === "center"
          ? center
          : Vector3.Zero();
    content.position = anchor.scale(-1).add(
      new Vector3(normalization.offset[0], normalization.offset[1], normalization.offset[2]),
    );
  }

  function frameToContent() {
    const bounds = getWorldBounds();
    if (!bounds) return;
    const center = Vector3.Center(bounds.min, bounds.max);
    const size = bounds.max.subtract(bounds.min).length() || 4;
    camera.setTarget(lockTargetToPivot ? Vector3.Zero() : center);
    camera.radius = size * normalization.fitMargin;
    camera.lowerRadiusLimit = size * 0.4;
    camera.upperRadiusLimit = size * 8;
    camera.minZ = Math.max(0.01, size * 0.01);
    applyCameraView();
  }

  function applyCameraView() {
    const target = camera.getTarget().clone();
    const radius = camera.radius;
    switch (view) {
      case "front":
        camera.upVector.copyFromFloats(0, 1, 0);
        camera.setPosition(target.add(new Vector3(0, 0, radius)));
        break;
      case "side":
        camera.upVector.copyFromFloats(0, 1, 0);
        camera.setPosition(target.add(new Vector3(radius, 0, 0)));
        break;
      case "top":
        camera.upVector.copyFromFloats(0, 0, 1);
        camera.setPosition(target.add(new Vector3(0, radius, 0.001)));
        break;
      case "isometric":
      default:
        camera.upVector.copyFromFloats(0, 1, 0);
        camera.alpha = -Math.PI / 4;
        camera.beta = Math.PI / 3;
        break;
    }
  }

  // Optional shared-atlas support: paint a single texture onto every loaded
  // material and flatten the PBR response (for packs that ship one colormap).
  // Kenney GLBs are self-contained/vertex-colored, so this is usually a no-op.
  function applyAtlas(meshes: AbstractMesh[], url: string) {
    const tex = new Texture(url, scene, false, false); // glTF UVs: don't invert Y
    tex.name = "atlas";
    const paint = (mat: Material | null) => {
      if (!mat) return;
      const subs = mat instanceof MultiMaterial ? mat.subMaterials : [mat];
      for (const sm of subs) {
        if (!sm) continue;
        const anyMat = sm as unknown as Record<string, unknown>;
        if ("albedoTexture" in anyMat) anyMat.albedoTexture = tex; // PBRMaterial (from glb)
        if ("diffuseTexture" in anyMat) anyMat.diffuseTexture = tex; // StandardMaterial
        if ("metallic" in anyMat) anyMat.metallic = 0; // flat shading
        if ("roughness" in anyMat) anyMat.roughness = 1;
      }
    };
    for (const m of meshes) paint(m.material);
  }

  if (opts.modelUrl) {
    onStatus?.("loading…");
    SceneLoader.ImportMeshAsync("", "", opts.modelUrl, scene)
      .then((res) => {
        loaded = res.meshes;
        const root = res.meshes.find((m) => !m.parent) ?? res.meshes[0];
        if (root) {
          root.parent = content;
          modelRoot = root;
          applyOrient();
        }
        if (opts.atlasUrl) applyAtlas(res.meshes, opts.atlasUrl);
        normalizeContent();
        frameToContent();
        onStatus?.("");
      })
      .catch((err) => {
        onStatus?.(`failed to load — showing placeholder`);
        console.error("[designs] model load failed:", err);
        buildPlaceholder();
      });
  } else {
    buildPlaceholder();
  }

  function buildPlaceholder() {
    const variant = opts.variant ?? "interceptor";
    const mat = (hex: string, emissive = false) => {
      const m = new StandardMaterial(`mat-${hex}`, scene);
      m.diffuseColor = Color3.FromHexString(hex);
      if (emissive) m.emissiveColor = Color3.FromHexString(hex);
      return m;
    };
    const parts: AbstractMesh[] = [];

    if (variant === "hauler") {
      const hull = mat("#c9a14a");
      const body = MeshBuilder.CreateBox("body", { width: 2, height: 1, depth: 3 }, scene);
      body.material = hull;
      const cab = MeshBuilder.CreateBox("cab", { width: 1, height: 0.6, depth: 0.9 }, scene);
      cab.position.set(0, 0.7, 1.4);
      cab.material = mat("#6affd0", true);
      const podL = MeshBuilder.CreateBox("podL", { width: 0.7, height: 0.7, depth: 2.2 }, scene);
      podL.position.set(-1.4, 0, 0);
      podL.material = mat("#8a7a3a");
      const podR = podL.clone("podR");
      podR.position.x = 1.4;
      const thr = MeshBuilder.CreateCylinder("thr", { diameter: 0.9, height: 0.4, tessellation: 8 }, scene);
      thr.rotation.x = Math.PI / 2;
      thr.position.z = -1.7;
      thr.material = mat("#ff9f43", true);
      parts.push(body, cab, podL, podR, thr);
    } else if (variant === "scout") {
      const hull = mat("#7fe0b0");
      const body = MeshBuilder.CreateCylinder("body", { diameter: 1, height: 1.6, tessellation: 6 }, scene);
      body.rotation.x = Math.PI / 2;
      body.material = hull;
      const dome = MeshBuilder.CreateSphere("dome", { diameter: 1.1, segments: 8 }, scene);
      dome.position.z = 0.5;
      dome.material = mat("#6affd0", true);
      const finL = MeshBuilder.CreateBox("finL", { width: 0.12, height: 0.9, depth: 0.8 }, scene);
      finL.position.set(-0.55, 0, -0.6);
      finL.material = hull;
      const finR = finL.clone("finR");
      finR.position.x = 0.55;
      const thr = MeshBuilder.CreateCylinder("thr", { diameter: 0.55, height: 0.3, tessellation: 8 }, scene);
      thr.rotation.x = Math.PI / 2;
      thr.position.z = -0.95;
      thr.material = mat("#ff9f43", true);
      parts.push(body, dome, finL, finR, thr);
    } else {
      const hull = mat("#9fb0ff");
      const body = MeshBuilder.CreateBox("body", { width: 0.8, height: 0.4, depth: 2.6 }, scene);
      body.material = hull;
      const nose = MeshBuilder.CreateCylinder(
        "nose",
        { diameterTop: 0, diameterBottom: 0.8, height: 1.4, tessellation: 4 },
        scene
      );
      nose.rotation.x = Math.PI / 2;
      nose.position.z = 1.8;
      nose.material = hull;
      const wingL = MeshBuilder.CreateBox("wingL", { width: 1.4, height: 0.1, depth: 0.7 }, scene);
      wingL.position.set(-0.9, 0, -0.5);
      wingL.rotation.y = 0.3;
      wingL.material = hull;
      const wingR = MeshBuilder.CreateBox("wingR", { width: 1.4, height: 0.1, depth: 0.7 }, scene);
      wingR.position.set(0.9, 0, -0.5);
      wingR.rotation.y = -0.3;
      wingR.material = hull;
      const cockpit = MeshBuilder.CreateSphere("cockpit", { diameter: 0.5, segments: 6 }, scene);
      cockpit.position.set(0, 0.25, 0.5);
      cockpit.material = mat("#6affd0", true);
      const thr = MeshBuilder.CreateCylinder("thr", { diameter: 0.45, height: 0.3, tessellation: 8 }, scene);
      thr.rotation.x = Math.PI / 2;
      thr.position.z = -1.4;
      thr.material = mat("#ff9f43", true);
      parts.push(body, nose, wingL, wingR, cockpit, thr);
    }

    loaded = parts;
    for (const m of loaded) m.parent = content;
    normalizeContent();
    frameToContent();
    onStatus?.(`${variant} · procedural`);
  }

  function buildPivotMarker() {
    const makeMat = (name: string, hex: string) => {
      const mat = new StandardMaterial(name, scene);
      mat.diffuseColor = Color3.FromHexString(hex);
      mat.emissiveColor = Color3.FromHexString(hex).scale(0.7);
      mat.disableLighting = true;
      mat.alpha = 0.95;
      return mat;
    };
    const showThrough = (mesh: Mesh) => {
      mesh.onBeforeRenderObservable.add(() => engine.setDepthBuffer(false));
      mesh.onAfterRenderObservable.add(() => engine.setDepthBuffer(true));
    };

    const dot = MeshBuilder.CreateSphere("pivot-dot", { diameter: 0.28, segments: 12 }, scene);
    dot.material = makeMat("pivot-dot-mat", "#ffffff");
    dot.isPickable = false;
    dot.renderingGroupId = 2;
    showThrough(dot);

    const xAxis = MeshBuilder.CreateCylinder("pivot-x", { diameter: 0.07, height: 2.4, tessellation: 12 }, scene);
    xAxis.rotation.z = Math.PI / 2;
    xAxis.material = makeMat("pivot-x-mat", "#ff6b6b");
    xAxis.isPickable = false;
    xAxis.renderingGroupId = 2;
    showThrough(xAxis);

    const yAxis = MeshBuilder.CreateCylinder("pivot-y", { diameter: 0.07, height: 2.4, tessellation: 12 }, scene);
    yAxis.material = makeMat("pivot-y-mat", "#6affb0");
    yAxis.isPickable = false;
    yAxis.renderingGroupId = 2;
    showThrough(yAxis);

    const zAxis = MeshBuilder.CreateCylinder("pivot-z", { diameter: 0.07, height: 2.4, tessellation: 12 }, scene);
    zAxis.rotation.x = Math.PI / 2;
    zAxis.material = makeMat("pivot-z-mat", "#6aa8ff");
    zAxis.isPickable = false;
    zAxis.renderingGroupId = 2;
    showThrough(zAxis);

    const ring = MeshBuilder.CreateTorus("pivot-ring", { diameter: 0.9, thickness: 0.04, tessellation: 32 }, scene);
    ring.rotation.x = Math.PI / 2;
    ring.material = makeMat("pivot-ring-mat", "#ffe28a");
    ring.isPickable = false;
    ring.renderingGroupId = 2;
    showThrough(ring);
  }

  function buildForwardMarker() {
    const makeMat = (name: string, hex: string) => {
      const mat = new StandardMaterial(name, scene);
      mat.diffuseColor = Color3.FromHexString(hex);
      mat.emissiveColor = Color3.FromHexString(hex).scale(0.8);
      mat.disableLighting = true;
      mat.alpha = 0.95;
      return mat;
    };

    const shaft = MeshBuilder.CreateCylinder(
      "forward-shaft",
      { diameter: 0.08, height: 3.2, tessellation: 12 },
      scene,
    );
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = 1.6;
    shaft.position.y = -0.02;
    shaft.material = makeMat("forward-shaft-mat", "#ffd76a");
    shaft.isPickable = false;

    const tip = MeshBuilder.CreateCylinder(
      "forward-tip",
      { diameterTop: 0, diameterBottom: 0.28, height: 0.7, tessellation: 12 },
      scene,
    );
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 3.55;
    tip.position.y = -0.02;
    tip.material = makeMat("forward-tip-mat", "#ffd76a");
    tip.isPickable = false;

    const crossbar = MeshBuilder.CreateCylinder(
      "forward-crossbar",
      { diameter: 0.05, height: 0.8, tessellation: 12 },
      scene,
    );
    crossbar.rotation.z = Math.PI / 2;
    crossbar.position.z = 0.2;
    crossbar.position.y = -0.02;
    crossbar.material = makeMat("forward-crossbar-mat", "#ffd76a");
    crossbar.isPickable = false;
  }

  function setPixelate(on: boolean) {
    engine.setHardwareScalingLevel(on ? 4 : 1);
  }
  setPixelate(opts.pixelate ?? false);

  engine.runRenderLoop(() => {
    if (spin) pivot.rotation.y += engine.getDeltaTime() / 1000 * spinSpeed;
    scene.render();
  });

  const onResize = () => engine.resize();
  window.addEventListener("resize", onResize);

  return {
    dispose() {
      window.removeEventListener("resize", onResize);
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
    setPixelate,
    setSpin(on: boolean) {
      spin = on;
    },
    setView(nextView: ViewerCameraView) {
      view = nextView;
      applyCameraView();
    },
    setOrient(x: number, y: number, z: number) {
      orient[0] = x;
      orient[1] = y;
      orient[2] = z;
      applyOrient();
      normalizeContent();
      frameToContent();
    },
  };
}

function hexToColor4(hex: string): Color4 {
  const c = Color3.FromHexString(hex);
  return new Color4(c.r, c.g, c.b, 1);
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
