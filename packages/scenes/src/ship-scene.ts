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
  type SceneHandle,
  type ShipLightingState,
} from "./scene-config";
import { createShipController } from "./ship-controller";

export {
  SHIP_HEIGHT,
  SHIP_SIZE,
  type CameraRotationMode,
  type GroundStyle,
  type LightingPreset,
  type SceneHandle,
  type ShipLightingState,
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

  let pixelScale = 1;
  function applyPixelScale(level: number) {
    pixelScale = level;
    engine.setHardwareScalingLevel(level);
  }
  function togglePixel() {
    applyPixelScale(pixelScale > 1 ? 1 : 3);
  }
  const input = createInputController(togglePixel);

  const onResize = () => engine.resize();
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
    groundTex.vOffset = (groundTex.vOffset + (dt * SCROLL * groundTex.vScale) / 1000) % 1;
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
      paintGround(style);
    },
    setPixelScale(level) {
      applyPixelScale(level);
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
