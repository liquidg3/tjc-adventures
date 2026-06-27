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
  type AbstractMesh,
} from "@babylonjs/core";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import "@babylonjs/loaders/glTF"; // registers the .glb loader
import { dbg } from "./debug";
import { createPerfMetrics } from "./perf-metrics";
import { createFlightController } from "./flight-controller";
import { createGroundLayer } from "./ground-layer";
import { createGunnerController } from "./gunner-controller";
import { createInputController } from "./input-controller";
import { createLightingController } from "./lighting-controller";
import { createPropFieldController } from "./prop-field";
import { createLevelPropLayer } from "./level-prop-layer";
import { createLevelTerrainLayer } from "./level-terrain-layer";
import {
  CAMERA_BASE_LOCAL_X,
  SCROLL,
  SHIP_HEIGHT,
  SHIP_START_Z,
  type CameraRotationMode,
  type GroundStyle,
  type LevelGridCell,
  type LevelTerrainCell,
  type LevelPlan,
  type LightingPreset,
  type PipelineMode,
  type SceneHandle,
  type ShipModelNormalization,
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
  type LevelGridCell,
  type LevelTerrainCell,
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

export interface ShipSceneOptions {
  baseGroundVisible?: boolean;
  loadProceduralScenery?: boolean;
  stopAtLevelEndHold?: boolean;
}

export function createShipScene(
  canvas: HTMLCanvasElement,
  options: ShipSceneOptions = {},
): SceneHandle {
  const perf = createPerfMetrics();
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: false });
  const scene = new Scene(engine);
  const sceneInstrumentation = new SceneInstrumentation(scene);
  sceneInstrumentation.captureActiveMeshesEvaluationTime = true;
  sceneInstrumentation.captureRenderTime = true;

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
  let shipHeight = SHIP_HEIGHT; // runtime-adjustable via the Ship Altitude slider

  const pointOnFlightPlane = (screenX: number, screenY: number) => {
    const ray = scene.createPickingRay(screenX, screenY, Matrix.Identity(), camera);
    const t = (shipHeight - ray.origin.y) / ray.direction.y;
    return ray.origin.add(ray.direction.scale(t));
  };

  const lighting = createLightingController(scene);
  lighting.applyPreset("dramatic");
  const shadowCasters = new Set<AbstractMesh>();

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
  let baseGroundVisible = options.baseGroundVisible ?? true;
  function syncBaseGroundVisibility() {
    groundA.setVisible(baseGroundVisible);
    groundB.setVisible(baseGroundVisible && bShown);
  }
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
      groundB.setClip(null);
      bShown = false;
      bKey = "";
    }
    syncBaseGroundVisibility();
  }
  function transitionGround(near: ZonePlanEntry, far: ZonePlanEntry, seamZ: number) {
    ensureA(near);
    ensureB(far);
    if (!bShown) {
      bShown = true;
    }
    syncBaseGroundVisibility();
    groundB.setClip(seamZ); // far climate fills z > seamZ; the seam drifts at scroll speed
  }
  function hideTransition() {
    if (!bShown) return;
    groundB.setClip(null);
    bShown = false;
    bKey = "";
    syncBaseGroundVisibility();
  }
  function setGroundSampling(mode: number) {
    groundA.setProceduralSampling(mode);
    groundB.setProceduralSampling(mode);
  }
  syncBaseGroundVisibility();

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

  const shipController = createShipController(scene, {
    addCaster(mesh) {
      for (const caster of [mesh, ...mesh.getChildMeshes(false)]) {
        if (shadowCasters.has(caster)) continue;
        lighting.shadowGen.addShadowCaster(caster, false);
        shadowCasters.add(caster);
      }
    },
    removeCaster(mesh) {
      for (const caster of [mesh, ...mesh.getChildMeshes(false)]) {
        if (!shadowCasters.has(caster)) continue;
        lighting.shadowGen.removeShadowCaster(caster, false);
        shadowCasters.delete(caster);
      }
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
  if (options.loadProceduralScenery !== false) void propField.loadScenery(24);

  const levelLayer = createLevelPropLayer(scene, perf, {
    stopAtEndHold: options.stopAtLevelEndHold,
  });
  const terrainLayer = createLevelTerrainLayer(scene, perf);
  const gunner = createGunnerController(scene);

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
  let externalInput: { vx: number; vz: number; boosting: boolean; dodge?: number } | null = null;
  let gunnerInput: { x: number; y: number; firing: boolean } | null = null;

  // Replica mode (mirrored views, e.g. the Gunner phone): instead of simulating
  // the ship/scroll locally, render the authoritative state the host pushes.
  let replica = false;
  let replicaState: { shipX: number; shipY: number; shipZ: number; scrollZ: number } | null = null;

  let lastSyncedLevelScrollZ = Number.NaN;
  function syncLevelPreviewScroll(force = false) {
    const z = levelLayer.getScrollZ();
    if (!force && Math.abs(z - lastSyncedLevelScrollZ) < 0.001) return;
    lastSyncedLevelScrollZ = z;
    groundA.setScrollDistance(z);
    if (bShown) groundB.setScrollDistance(z);
    terrainLayer.setScrollZ(z);
  }

  const onResize = () => {
    engine.resize();
    applyPipeline(); // rtHeight is relative to canvas height — recompute scale
  };
  window.addEventListener("resize", onResize);

  // --- loop ---
  let lastShipDebugAt = 0;
  engine.runRenderLoop(() => {
    const frameT0 = performance.now();
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
    const ship = shipController.getShip();
    const shipPivot = shipController.getShipPivot();
    const keyboardInput = input.getState();
    const mergedInput = externalInput
      ? {
          vx: clamp(keyboardInput.vx + externalInput.vx, -1, 1),
          vz: clamp(keyboardInput.vz + externalInput.vz, -1, 1),
          boosting: keyboardInput.boosting || externalInput.boosting,
          dodge: keyboardInput.dodge || externalInput.dodge || 0,
        }
      : keyboardInput;
    const now = performance.now();
    if (now - lastShipDebugAt > 1000) {
      lastShipDebugAt = now;
      dbg("scene ship tick", {
        hasShip: Boolean(ship),
        hasPivot: Boolean(shipPivot),
        ship: ship
          ? {
              name: ship.name,
              uniqueId: ship.uniqueId,
              enabled: ship.isEnabled(),
              disposed: ship.isDisposed(),
              position: {
                x: roundDebug(ship.position.x),
                y: roundDebug(ship.position.y),
                z: roundDebug(ship.position.z),
              },
              scaling: {
                x: roundDebug(ship.scaling.x),
                y: roundDebug(ship.scaling.y),
                z: roundDebug(ship.scaling.z),
              },
              childMeshes: ship.getChildMeshes(false).length,
            }
          : null,
        shipHeight,
        fps: roundDebug(engine.getFps()),
        levelScrollZ: roundDebug(levelLayer.getScrollZ()),
        levelTotalDepth: roundDebug(levelLayer.getTotalDepth()),
      });
    }
    if (ship) {
      perf.measure("frame.flight", () => flight.step({
        dt,
        canvas,
        scene,
        camera,
        cameraRig,
        ship,
        shipPivot,
        shipHeight,
        input: mergedInput,
        pointOnFlightPlane,
      }));
    }
    // Replica view: ease the ship toward the host's authoritative position
    // (the local flight sim above ran with no input, so it just held still).
    if (replica && ship && replicaState) {
      const mix = Math.min(1, dt * 16);
      ship.position.x += (replicaState.shipX - ship.position.x) * mix;
      ship.position.y += (replicaState.shipY - ship.position.y) * mix;
      ship.position.z += (replicaState.shipZ - ship.position.z) * mix;
    }
    perf.measure("frame.gunner", () => {
      const target = gunnerInput
        ? pointOnFlightPlane(
            clamp(gunnerInput.x, 0, 1) * (canvas.clientWidth || scene.getEngine().getRenderWidth()),
            clamp(gunnerInput.y, 0, 1) * (canvas.clientHeight || scene.getEngine().getRenderHeight()),
          )
        : null;
      gunner.step(dt, ship, {
        firing: gunnerInput?.firing === true,
        target: target && isFinite(target.x + target.y + target.z) ? target : null,
      });
    });

    // a level plan (when playing) drives ground + lighting by scrolled time
    perf.measure("frame.sequencer", () => sequencer.update(dt));

    // Advance the prop layer, then sync ground + terrain to the new scroll position.
    // The ground scrolls freely when no level is loaded; when a level is loaded the
    // prop layer owns the scroll position and ground/terrain follow it.
    const levelTotalDepth = levelLayer.getTotalDepth();
    perf.measure("frame.scenery", () => propField.update(dt));
    if (replica) {
      // Don't advance scroll locally — ease toward the host's scroll position.
      if (replicaState) {
        const cur = levelLayer.getScrollZ();
        const mix = Math.min(1, dt * 16);
        levelLayer.setScrollZ(cur + (replicaState.scrollZ - cur) * mix);
        syncLevelPreviewScroll(true);
      }
    } else {
      perf.measure("frame.levelStep", () => levelLayer.step(dt));
      if (levelTotalDepth > 0) {
        perf.measure("frame.syncLevelScroll", syncLevelPreviewScroll);
      } else {
        groundA.scroll(dt * SCROLL);
        if (bShown) groundB.scroll(dt * SCROLL);
      }
    }

    perf.measure("frame.render", () => scene.render());
    perf.sample("babylon.render", sceneInstrumentation.renderTimeCounter.current);
    perf.sample("babylon.activeMeshesEval", sceneInstrumentation.activeMeshesEvaluationTimeCounter.current);
    perf.sample("stats.drawCalls", sceneInstrumentation.drawCallsCounter.current);
    perf.sample("stats.meshes", scene.meshes.length);
    perf.sample("stats.materials", scene.materials.length);
    perf.sample("stats.activeMeshes", scene.getActiveMeshes().length);
    perf.sample("stats.activeIndices", scene.getActiveIndices());
    perf.sample("stats.totalVertices", scene.getTotalVertices());
    const terrainStats = terrainLayer.getStats();
    const propStats = levelLayer.getStats();
    perf.sample("stats.terrainCells", terrainStats.placedCells);
    perf.sample("stats.terrainMeshes", terrainStats.placedMeshes);
    perf.sample("stats.propCells", propStats.placedCells);
    perf.sample("stats.propMeshes", propStats.placedMeshes);
    perf.sample("frame.total", performance.now() - frameT0);
  });

  dbg("scene ready (3D meadow)");

  return {
    setCameraRotationMode(mode) {
      flight.setCameraRotationMode(mode);
    },
    setExternalInput(nextInput) {
      externalInput = nextInput
        ? {
            vx: clamp(nextInput.vx, -1, 1),
            vz: clamp(nextInput.vz, -1, 1),
            boosting: nextInput.boosting,
            dodge: clamp(nextInput.dodge ?? 0, -1, 1),
          }
        : null;
    },
    setGunnerInput(nextInput) {
      gunnerInput = nextInput
        ? {
            x: clamp(nextInput.x, 0, 1),
            y: clamp(nextInput.y, 0, 1),
            firing: nextInput.firing === true,
          }
        : null;
    },
    setPlayerShipModel(url, normalization) {
      shipController.setModelUrl(url, normalization);
    },
    setPlayerShipVisible(visible) {
      shipController.setVisible(visible);
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
    setBaseGroundVisible(visible) {
      baseGroundVisible = visible;
      syncBaseGroundVisibility();
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
      if (!plan) hideTransition();
    },
    getZoneStatus() {
      return sequencer.getStatus();
    },
    setLevelCells(cells: LevelGridCell[], width, depth, cellSize, assetUrlMap) {
      propField.setVisible(cells.length === 0);
      perf.measure("api.setLevelCells", () => {
        levelLayer.setLevelCells(cells, width, depth, cellSize, assetUrlMap);
      });
    },
    setLevelTerrainCells(cells: LevelTerrainCell[], width, depth, cellSize, colorMap) {
      perf.measure("api.setLevelTerrainCells", () => {
        terrainLayer.setTerrainCells(cells, width, depth, cellSize, colorMap);
      });
    },
    setLevelTerrainRenderWindowRows(backRows, forwardRows) {
      perf.measure("api.setLevelTerrainRenderWindowRows", () => {
        terrainLayer.setRenderWindowRows(backRows, forwardRows);
      });
    },
    setLevelScrollZ(z) {
      perf.measure("api.setLevelScrollZ", () => {
        levelLayer.setScrollZ(z);
        syncLevelPreviewScroll(true);
      });
    },
    setLevelScrollPaused(paused) {
      levelLayer.setPaused(paused);
    },
    getLevelScrollZ() {
      return levelLayer.getScrollZ();
    },
    setReplicaMode(enabled) {
      replica = enabled;
      levelLayer.setPaused(enabled);
      if (!enabled) replicaState = null;
    },
    applyReplicaState(state) {
      replicaState = state;
    },
    getLevelTotalDepth() {
      return levelLayer.getTotalDepth();
    },
    getFps() {
      return engine.getFps();
    },
    getPerfMetrics() {
      return perf.flush();
    },
    dispose() {
      input.dispose();
      sceneInstrumentation.dispose();
      gunner.dispose();
      levelLayer.dispose();
      terrainLayer.dispose();
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

function roundDebug(v: number) {
  return Math.round(v * 1000) / 1000;
}
