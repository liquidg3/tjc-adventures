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
  type AbstractMesh,
  type Material,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF"; // registers the .glb / .gltf loader

export type ShipVariant = "interceptor" | "hauler" | "scout";

export interface ViewerOptions {
  modelUrl?: string;
  variant?: ShipVariant;
  pixelate?: boolean;
  spin?: boolean;
  bg?: string;
  /** Apply this texture to all loaded materials (a shared atlas, if a pack uses one). */
  atlasUrl?: string;
  /** Extra orientation (degrees, XYZ) applied to the loaded model. */
  orient?: [number, number, number];
}

export interface ViewerHandle {
  dispose: () => void;
  setPixelate: (on: boolean) => void;
  setSpin: (on: boolean) => void;
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
  camera.attachControl(canvas, true);
  camera.wheelDeltaPercentage = 0.01;
  camera.lowerRadiusLimit = 1.5;
  camera.upperRadiusLimit = 80;

  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.85;
  const dir = new DirectionalLight("dir", new Vector3(-1, -2, -1), scene);
  dir.intensity = 1.1;

  const pivot = new TransformNode("pivot", scene);
  let spin = opts.spin ?? true;
  let loaded: AbstractMesh[] = [];

  // orientation applied to the loaded model (separate from the turntable spin on
  // the pivot), so it can be dialed live to find a pack's correct rotation
  let modelRoot: AbstractMesh | null = null;
  const orient: [number, number, number] = opts.orient ? [...opts.orient] : [0, 0, 0];
  const d2r = (d: number) => (d * Math.PI) / 180;
  function applyOrient() {
    if (modelRoot) modelRoot.rotation = new Vector3(d2r(orient[0]), d2r(orient[1]), d2r(orient[2]));
  }

  function frameToContent() {
    let min = new Vector3(Infinity, Infinity, Infinity);
    let max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const m of loaded) {
      m.computeWorldMatrix(true);
      const info = m.getBoundingInfo?.();
      if (!info) continue;
      min = Vector3.Minimize(min, info.boundingBox.minimumWorld);
      max = Vector3.Maximize(max, info.boundingBox.maximumWorld);
    }
    if (!isFinite(min.x)) return;
    const center = Vector3.Center(min, max);
    const size = max.subtract(min).length() || 4;
    camera.setTarget(center);
    camera.radius = size * 1.5;
    camera.lowerRadiusLimit = size * 0.4;
    camera.upperRadiusLimit = size * 8;
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
          root.parent = pivot;
          modelRoot = root;
          applyOrient();
        }
        if (opts.atlasUrl) applyAtlas(res.meshes, opts.atlasUrl);
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
    for (const m of loaded) m.parent = pivot;
    frameToContent();
    onStatus?.(`${variant} · procedural`);
  }

  function setPixelate(on: boolean) {
    engine.setHardwareScalingLevel(on ? 4 : 1);
  }
  setPixelate(opts.pixelate ?? false);

  engine.runRenderLoop(() => {
    if (spin) pivot.rotation.y += engine.getDeltaTime() / 1000 * 0.6;
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
    setOrient(x: number, y: number, z: number) {
      orient[0] = x;
      orient[1] = y;
      orient[2] = z;
      applyOrient();
    },
  };
}

function hexToColor4(hex: string): Color4 {
  const c = Color3.FromHexString(hex);
  return new Color4(c.r, c.g, c.b, 1);
}
