import {
  Engine,
  Scene,
  FreeCamera,
  Vector3,
  Matrix,
  Color3,
  Color4,
  MeshBuilder,
  StandardMaterial,
  DynamicTexture,
  Texture,
  TransformNode,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF"; // registers the .glb loader
import { dbg } from "./debug";
import { createFlightController } from "./flight-controller";
import { drawGround } from "./ground-texture";
import { createInputController } from "./input-controller";
import { createLightingController } from "./lighting-controller";
import { createPropFieldController } from "./prop-field";
import {
  CAMERA_BASE_LOCAL_X,
  SCROLL,
  SHIP_HEIGHT,
  type CameraRotationMode,
  type GroundStyle,
  type LightingPreset,
  type PipelineMode,
  type SceneHandle,
  type ShipLightingState,
  type TileSampling,
} from "./scene-config";
import { createShipController } from "./ship-controller";

export {
  SHIP_HEIGHT,
  SHIP_SIZE,
  type CameraRotationMode,
  type GroundStyle,
  type LightingPreset,
  type PipelineMode,
  type SceneHandle,
  type ShipLightingState,
  type TileSampling,
} from "./scene-config";

/**
 * Sky Raid — the meadow, in 2.5D. A tilted perspective camera looks down a
 * lit meadow that streams toward you; a real 3D ship banks as you fly, with
 * scattered 3D scenery for depth. Press P for the chunky HD-2D pixel look.
 *
 * Models are served from /models/**.
 */

export function createShipScene(canvas: HTMLCanvasElement): SceneHandle {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: false });
  const scene = new Scene(engine);

  // --- sky + atmosphere ---
  const sky = new Color3(0.46, 0.62, 0.85);
  scene.clearColor = new Color4(sky.r, sky.g, sky.b, 1);
  // no fog — clear view of the whole meadow

  // --- high, mostly top-down camera (slight tilt for a little depth) ---
  const cameraPos = new Vector3(0, 220, -28);
  const cameraTarget = new Vector3(0, 10, 80);
  const camera = new FreeCamera("cam", cameraPos.clone(), scene);
  camera.setTarget(cameraTarget); // tilt back a bit so more of the field is visible ahead
  camera.fov = 0.7;
  const cameraRig = new TransformNode("cam-rig", scene);
  cameraRig.position.copyFrom(cameraPos);
  cameraRig.rotation.copyFrom(camera.rotation);
  const cameraRigBaseRot = cameraRig.rotation.clone();
  camera.parent = cameraRig;
  camera.position.setAll(0);
  camera.rotation.set(CAMERA_BASE_LOCAL_X, 0, 0);
  const cameraBaseRot = camera.rotation.clone();
  const flight = createFlightController(camera, cameraRig, cameraBaseRot, cameraRigBaseRot);

  const pointOnFlightPlane = (screenX: number, screenY: number) => {
    const ray = scene.createPickingRay(screenX, screenY, Matrix.Identity(), camera);
    const t = (SHIP_HEIGHT - ray.origin.y) / ray.direction.y;
    return ray.origin.add(ray.direction.scale(t));
  };

  const lighting = createLightingController(scene);
  lighting.applyPreset("dramatic");

  // --- meadow ground (scrolls via UV; style switchable at runtime) ---
  const GROUND_SIZE = 512;
  const groundTex = new DynamicTexture("ground", { width: GROUND_SIZE, height: GROUND_SIZE }, scene, true);
  groundTex.updateSamplingMode(Texture.TRILINEAR_SAMPLINGMODE);
  groundTex.wrapU = Texture.WRAP_ADDRESSMODE;
  groundTex.wrapV = Texture.WRAP_ADDRESSMODE;
  function paintGround(style: GroundStyle) {
    const tiling = drawGround(groundTex.getContext(), GROUND_SIZE, style);
    groundTex.update();
    groundTex.uScale = tiling.u;
    groundTex.vScale = tiling.v;
  }
  paintGround("painterly");
  const groundMat = new StandardMaterial("groundMat", scene);
  groundMat.diffuseTexture = groundTex;
  groundMat.specularColor = new Color3(0, 0, 0);
  const ground = MeshBuilder.CreateGround("ground", { width: 1200, height: 1000 }, scene);
  ground.position.z = 400; // extends far ahead so it recedes to a horizon, no hard edge
  ground.material = groundMat;
  ground.receiveShadows = true;

  // Image-backed ground texture that overrides the procedural DynamicTexture
  // when set. Two sampling regimes:
  //   nearest   — pixel-art tiles; mipmaps disabled so every texel stays a square
  //   trilinear — photoreal/painterly; mipmaps on, bilinear-filtered (avoids
  //               aliasing as the camera tilts toward the horizon)
  // Idempotent: same URL + same sampling → only the repeat scale updates,
  // so dragging the Repeat slider doesn't reload the PNG every tick.
  let tileTex: Texture | null = null;
  let tileUrl: string | null = null;
  let tileSampling: TileSampling | null = null;
  function applyTile(
    url: string | null,
    repeatPerSide: number,
    sampling: TileSampling = "nearest",
  ) {
    if (!url) {
      if (tileTex) {
        tileTex.dispose();
        tileTex = null;
        tileUrl = null;
        tileSampling = null;
      }
      groundMat.diffuseTexture = groundTex;
      return;
    }
    if (url === tileUrl && sampling === tileSampling && tileTex) {
      tileTex.uScale = repeatPerSide;
      tileTex.vScale = repeatPerSide;
      return;
    }
    if (tileTex) tileTex.dispose();
    const noMipmap = sampling === "nearest";
    const mode =
      sampling === "nearest"
        ? Texture.NEAREST_SAMPLINGMODE
        : Texture.TRILINEAR_SAMPLINGMODE;
    const t = new Texture(url, scene, noMipmap, /* invertY */ true, mode);
    t.wrapU = Texture.WRAP_ADDRESSMODE;
    t.wrapV = Texture.WRAP_ADDRESSMODE;
    t.uScale = repeatPerSide;
    t.vScale = repeatPerSide;
    tileTex = t;
    tileUrl = url;
    tileSampling = sampling;
    groundMat.diffuseTexture = t;
  }

  let shipHeight = SHIP_HEIGHT; // runtime-adjustable via the Ship Altitude slider
  const shipController = createShipController(scene, {
    addCaster(mesh) {
      lighting.shadowGen.addShadowCaster(mesh, true);
    },
    removeCaster(mesh) {
      lighting.shadowGen.removeShadowCaster(mesh, true);
    },
  });
  const propField = createPropFieldController(scene);

  shipController.loadInitialShip();
  void propField.scatter("/models/environment/tree_fur.glb", 12, 24);
  void propField.scatter("/models/environment/tree_stylized.glb", 12, 24);
  void propField.scatter("/models/environment/rocks_small.glb", 30, 3);

  // ── render pipeline (pixel-art spike) ────────────────────────────────────
  // Two knobs decide the look:
  //   pipelineMode  — direct (no pixelation) / low-res-nearest / low-res-bilinear
  //   rtHeight      — target render-buffer height when in a low-res mode
  // Hardware scaling shrinks the WebGL buffer to (rtHeight × aspect), and the
  // canvas CSS `image-rendering` decides how the browser upscales it. The
  // ground texture's sampling mode flips with the pipeline so trilinear
  // filtering doesn't re-mush the pixels we just committed to.
  let pixelScale = 1;
  let pipelineMode: PipelineMode = "direct";
  let rtHeight = 270;

  function applyPipeline() {
    if (pipelineMode === "direct") {
      canvas.style.imageRendering = "auto";
      engine.setHardwareScalingLevel(pixelScale);
      groundTex.updateSamplingMode(Texture.TRILINEAR_SAMPLINGMODE);
      return;
    }
    const cssH = canvas.clientHeight || rtHeight;
    const scale = Math.max(1, cssH / rtHeight);
    engine.setHardwareScalingLevel(scale);
    canvas.style.imageRendering =
      pipelineMode === "low-res-nearest" ? "pixelated" : "auto";
    groundTex.updateSamplingMode(
      pipelineMode === "low-res-nearest"
        ? Texture.NEAREST_SAMPLINGMODE
        : Texture.TRILINEAR_SAMPLINGMODE,
    );
  }

  function applyPixelScale(level: number) {
    pixelScale = level;
    applyPipeline();
  }
  function togglePixel() {
    pipelineMode =
      pipelineMode === "low-res-nearest" ? "direct" : "low-res-nearest";
    applyPipeline();
  }
  const input = createInputController(togglePixel);

  const onResize = () => {
    engine.resize();
    applyPipeline(); // rtHeight is relative to canvas height — recompute scale
  };
  window.addEventListener("resize", onResize);

  // --- loop ---
  engine.runRenderLoop(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
    const ship = shipController.getShip();
    const shipPivot = shipController.getShipPivot();
    if (ship) {
      flight.step({
        dt,
        canvas,
        scene,
        camera,
        cameraRig,
        ship,
        shipPivot,
        shipHeight,
        input: input.getState(),
        pointOnFlightPlane,
      });
    }

    // scroll the meadow + stream scenery toward the camera
    // scroll the texture to match prop world-speed for the CURRENT tiling
    // (1 texture tile spans groundDepth/vScale world units; ground depth = 1000)
    const activeTex = tileTex ?? groundTex;
    activeTex.vOffset = (activeTex.vOffset + (dt * SCROLL * activeTex.vScale) / 1000) % 1;
    propField.update(dt);

    scene.render();
  });

  dbg("scene ready (3D meadow)");

  return {
    setCameraRotationMode(mode) {
      flight.setCameraRotationMode(mode);
    },
    setPlayerShipModel(url) {
      shipController.setModelUrl(url);
    },
    setShipHeight(height) {
      shipHeight = height;
    },
    setShipSize(size) {
      shipController.setShipSize(size);
    },
    getShipPosition() {
      return shipController.getShipPosition();
    },
    resetShip() {
      shipController.resetShip();
    },
    setGroundStyle(style) {
      applyTile(null, 0); // any procedural style implicitly drops tile mode
      paintGround(style);
    },
    setGroundTile(url, repeatPerSide, sampling = "nearest") {
      applyTile(url, repeatPerSide, sampling);
    },
    setPixelScale(level) {
      applyPixelScale(level);
    },
    setPipelineMode(mode) {
      pipelineMode = mode;
      applyPipeline();
    },
    setRtHeight(h) {
      rtHeight = Math.max(60, h);
      applyPipeline();
    },
    setLightingPreset(preset) {
      lighting.applyPreset(preset);
    },
    setSunIntensity(v) {
      lighting.setSunIntensity(v);
    },
    setSkyIntensity(v) {
      lighting.setSkyIntensity(v);
    },
    setSunAzimuth(deg) {
      lighting.setSunAzimuth(deg);
    },
    setSunElevation(deg) {
      lighting.setSunElevation(deg);
    },
    setShipLightDirectIntensity(v) {
      shipController.setShipLighting((state) => {
        state.directIntensity = v;
      });
    },
    setShipLightEnvironmentIntensity(v) {
      shipController.setShipLighting((state) => {
        state.environmentIntensity = v;
      });
    },
    setShipLightRoughness(v) {
      shipController.setShipLighting((state) => {
        state.roughness = v;
      });
    },
    setShipLightSpecularIntensity(v) {
      shipController.setShipLighting((state) => {
        state.specularIntensity = v;
      });
    },
    setShipLightExposure(v) {
      shipController.setShipLighting((state) => {
        state.exposure = v;
      });
    },
    setShipLightContrast(v) {
      shipController.setShipLighting((state) => {
        state.contrast = v;
      });
    },
    setShipLightAlbedoBoost(v) {
      shipController.setShipLighting((state) => {
        state.albedoBoost = v;
      });
    },
    setShipLightAmbientStrength(v) {
      shipController.setShipLighting((state) => {
        state.ambientStrength = v;
      });
    },
    getShipLightingState() {
      return shipController.getShipLightingState();
    },
    getLightingState() {
      return lighting.getLightingState();
    },
    dispose() {
      input.dispose();
      window.removeEventListener("resize", onResize);
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
