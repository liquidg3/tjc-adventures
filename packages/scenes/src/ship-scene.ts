import {
  Engine,
  Scene,
  FreeCamera,
  Vector3,
  Matrix,
  Color3,
  Color4,
  Texture,
  TransformNode,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF"; // registers the .glb loader
import { dbg } from "./debug";
import { createFlightController } from "./flight-controller";
import { createGroundLayer } from "./ground-layer";
import { createInputController } from "./input-controller";
import { createLightingController } from "./lighting-controller";
import { createPropFieldController } from "./prop-field";
import {
  CAMERA_BASE_LOCAL_X,
  SCROLL,
  SHIP_HEIGHT,
  SHIP_START_Z,
  type CameraRotationMode,
  type GroundStyle,
  type LevelPlan,
  type LightingPreset,
  type PipelineMode,
  type SceneHandle,
  type SceneryDensities,
  type ShipLightingState,
  type TileSampling,
  type ZonePlanEntry,
} from "./scene-config";
import { createShipController } from "./ship-controller";
import { createZoneSequencer } from "./zone-sequencer";

export {
  presetSunDefaults,
  SHIP_HEIGHT,
  SHIP_SIZE,
  type CameraRotationMode,
  type GroundStyle,
  type LevelPlan,
  type LightingPreset,
  type PipelineMode,
  type SceneHandle,
  type SceneryDensities,
  type SceneryKey,
  type ShipLightingState,
  type TileSampling,
  type ZonePlanEntry,
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

  // --- meadow ground: two stacked scrolling layers so the zone sequencer can
  //     wipe a new biome in across the field (layerB sweeps over layerA) ---
  const GROUND_W = 1200;
  const GROUND_DEPTH = 1000;
  const GROUND_Z = 400; // centered ahead so the plane recedes to a horizon
  const SEAM_FAR = GROUND_Z + GROUND_DEPTH / 2; // far edge (top of screen)
  const SEAM_NEAR = GROUND_Z - GROUND_DEPTH / 2; // near edge (past the camera)
  const groundA = createGroundLayer(scene, {
    name: "groundA",
    width: GROUND_W,
    depth: GROUND_DEPTH,
    z: GROUND_Z,
  });
  const groundB = createGroundLayer(scene, {
    name: "groundB",
    width: GROUND_W,
    depth: GROUND_DEPTH,
    z: GROUND_Z,
    y: 0.05, // sits just above A so it draws on top where it isn't clipped
  });
  groundB.setVisible(false);

  // Ground orchestration for the sequencer. layerA is the live zone; during a
  // transition layerB holds the incoming zone and its clip seam sweeps from the
  // far horizon toward the camera, so you watch the new biome arrive across the
  // field. The look keys dedup repaints (painting a DynamicTexture is expensive).
  const lookKey = (z: ZonePlanEntry) =>
    z.groundTile ? `tile:${z.groundTile}|${z.tileRepeat}|${z.tileSampling}` : `style:${z.ground}`;
  let aKey = "";
  let bKey = "";
  let bShown = false;
  function ensureA(z: ZonePlanEntry) {
    const k = lookKey(z);
    if (k === aKey) return;
    groundA.applyLook(z);
    aKey = k;
  }
  function ensureB(z: ZonePlanEntry) {
    const k = lookKey(z);
    if (k === bKey) return;
    groundB.applyLook(z);
    bKey = k;
  }
  function showGround(z: ZonePlanEntry) {
    ensureA(z);
    if (bShown) {
      groundA.setVOffset(groundB.getVOffset()); // keep scroll phase across the handoff
      groundB.setVisible(false);
      groundB.setClip(null);
      bShown = false;
      bKey = "";
    }
  }
  function transitionGround(near: ZonePlanEntry, far: ZonePlanEntry, seamZ: number) {
    ensureA(near);
    ensureB(far);
    if (!bShown) {
      groundB.setVisible(true);
      bShown = true;
    }
    groundB.setClip(seamZ); // far climate fills z > seamZ; the seam drifts at scroll speed
  }
  function hideTransition() {
    if (!bShown) return;
    groundB.setVisible(false);
    groundB.setClip(null);
    bShown = false;
    bKey = "";
  }
  function setGroundSampling(mode: number) {
    groundA.setProceduralSampling(mode);
    groundB.setProceduralSampling(mode);
  }

  // Auto-scrolling level plan (zones). When a plan is loaded it owns the ground
  // and lighting; until then the scene stays under manual (Studio slider) control.
  const sequencer = createZoneSequencer(
    {
      showGround,
      transitionGround,
      resolveLighting(z) {
        return lighting.resolve(z.lighting, {
          sunI: z.sunI,
          skyI: z.skyI,
          azimuth: z.azimuth,
          elevation: z.elevation,
        });
      },
      applyLighting(r) {
        lighting.applyResolved(r);
      },
      applyShipLighting(s) {
        shipController.setShipLighting((state) => Object.assign(state, s));
      },
    },
    { scrollSpeed: SCROLL, shipZ: SHIP_START_Z, seamFar: SEAM_FAR, seamNear: SEAM_NEAR },
  );

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
  // when a plan plays, scenery density is read per-region from the climate at
  // each prop's world-Z; otherwise it's the manual set (the selected zone's)
  let currentPlan: LevelPlan | null = null;
  let manualScenery: SceneryDensities = { bush: 0.45, rock: 0.4, tree_fur: 0.3, tree_stylized: 0.3 };
  propField.setDensityProvider((z) => {
    if (currentPlan) {
      const idx = sequencer.zoneIndexAtWorldZ(z);
      if (idx != null) return currentPlan.zones[idx].scenery;
    }
    return manualScenery;
  });

  shipController.loadInitialShip();
  void propField.loadScenery(24);

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
      setGroundSampling(Texture.TRILINEAR_SAMPLINGMODE);
      return;
    }
    const cssH = canvas.clientHeight || rtHeight;
    const scale = Math.max(1, cssH / rtHeight);
    engine.setHardwareScalingLevel(scale);
    canvas.style.imageRendering =
      pipelineMode === "low-res-nearest" ? "pixelated" : "auto";
    setGroundSampling(
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

    // a level plan (when playing) drives ground + lighting by scrolled time
    sequencer.update(dt);

    // scroll the meadow + stream scenery toward the camera (both layers scroll
    // so the incoming biome moves with the field during a transition)
    groundA.scroll(dt * SCROLL);
    if (bShown) groundB.scroll(dt * SCROLL);
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
      groundA.setStyle(style);
      aKey = ""; // re-sync the sequencer's dedup if a plan plays later
    },
    setGroundTile(url, repeatPerSide, sampling = "nearest") {
      groundA.setTile(url, repeatPerSide, sampling);
      aKey = "";
    },
    setScenery(densities) {
      manualScenery = densities;
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
    setLevelPlan(plan) {
      currentPlan = plan;
      sequencer.setPlan(plan);
      if (!plan) hideTransition(); // back to manual: drop the incoming layer
    },
    getZoneStatus() {
      return sequencer.getStatus();
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
