import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import {
  createShipScene,
  type LevelGridCell,
  type LevelTerrainCell,
  type SceneHandle,
} from "@tjc/scenes";
import {
  CAMERA_ROTATIONS,
  LIGHTING_PRESETS,
  PIPELINE_MODES,
  PIXEL_LEVELS,
  RT_HEIGHTS,
  buildDefaultsFromState,
  createInitialState,
  mergeDefaults,
  readHashParams,
  serializeVerticalHash,
  verticalTestPlayReducer,
  type VerticalDefaults,
} from "./vertical-test-play-state";
import {
  mergeNormalizationOverrides,
  assetValueToUrl,
  getNormalizationPreset,
  resolveAssetNormalization,
  mergeNormalizationPresets,
  parseAssetAssignments,
} from "./asset-normalization";
import {
  emptyLevel,
  mergeLevel,
  projectObjectsToLegacyCells,
} from "./level-builder-state";
import { loadStagedModels, type ModelEntry } from "./3d-models-data";
import {
  buildModelCatalog,
  EMPTY_MODEL_CATALOG_OVERRIDES,
  parseModelCatalogOverrides,
  type ModelCatalogOverrides,
} from "./model-catalog";
import { usePersistedJson } from "./use-persisted-json";

const tjcLog = (...args: unknown[]) => console.log("%c[TJC]", "color:#6affd0;font-weight:bold", ...args);

const VERTICAL_DEFAULTS_URL = "/__vertical-defaults";
const HASH_WRITE_DEBOUNCE_MS = 150;

const ASSET_MAP_URL = "/__asset-map";
const ASSET_NORMALIZATION_PRESETS_URL = "/__asset-normalization-presets";
const ASSET_NORMALIZATION_OVERRIDES_URL = "/__asset-normalization-overrides";
const LEVEL_URL = "/__level-builder";
const MODEL_CATALOG_OVERRIDES_URL = "/__model-catalog-overrides";


/** Collapsible control panel — click the header to fold it away and fit more. */
function Panel({
  id,
  title,
  className,
  children,
  open,
  onToggle,
}: {
  id: string;
  title: string;
  className?: string;
  children: ReactNode;
  open: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <aside className={`control-panel ${className ?? ""}${open ? "" : " collapsed"}`}>
      <button className="panel-head" onClick={() => onToggle(id)}>
        <span>{title}</span>
        <span className="panel-caret">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="panel-body">{children}</div>}
    </aside>
  );
}

/** Compact labelled horizontal slider for the lighting controls. */
function LightSlider({
  label,
  title,
  value,
  min,
  max,
  step,
  digits = 2,
  suffix = "",
  onChange,
}: {
  label: string;
  title?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  digits?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="light-row" title={title}>
      <span className="light-label">{label}</span>
      <input
        type="range"
        className="h-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="light-val">
        {value.toFixed(digits)}
        {suffix}
      </span>
    </label>
  );
}

/** Vertical Test Play settings: the live scene + collapsible tuning panels. */
export function VerticalTestPlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const { value: level, loaded: levelLoaded } = usePersistedJson(
    LEVEL_URL,
    emptyLevel(),
    mergeLevel,
  );
  const catalogOverrides = usePersistedJson<ModelCatalogOverrides>(
    MODEL_CATALOG_OVERRIDES_URL,
    EMPTY_MODEL_CATALOG_OVERRIDES,
    parseModelCatalogOverrides,
  );
  const initialHashParamsRef = useRef<URLSearchParams>(readHashParams());
  const [state, dispatch] = useReducer(
    verticalTestPlayReducer,
    initialHashParamsRef.current,
    createInitialState
  );
  const [pos, setPos] = useState<{ x: number; y: number; z: number } | null>(null);
  const [levelPaused, setLevelPaused] = useState(false);
  const [levelScrollZ, setLevelScrollZ] = useState(0);
  const [levelTotalDepth, setLevelTotalDepth] = useState(0);
  const [sceneReady, setSceneReady] = useState(false);
  const [assignedAssetUrlMap, setAssignedAssetUrlMap] = useState<Record<string, string>>({});
  const [modelEntries, setModelEntries] = useState<ModelEntry[]>([]);

  const catalog = useMemo(
    () => buildModelCatalog(modelEntries, catalogOverrides.value),
    [modelEntries, catalogOverrides.value],
  );
  const levelAssetUrlMap = useMemo(() => {
    const urls: Record<string, string> = { ...assignedAssetUrlMap };
    for (const model of catalog) urls[model.modelValue] = model.url;
    return urls;
  }, [assignedAssetUrlMap, catalog]);

  useEffect(() => {
    fetch(VERTICAL_DEFAULTS_URL)
      .then((r) => r.json())
      .then((data: Partial<VerticalDefaults>) => {
        dispatch({
          type: "hydrate-defaults",
          defaults: mergeDefaults(data),
          hashParams: initialHashParamsRef.current,
        });
      })
      .catch(() => {
        dispatch({
          type: "hydrate-defaults",
          defaults: mergeDefaults(null),
          hashParams: initialHashParamsRef.current,
        });
      });
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    tjcLog("VerticalTestPlay mount", {
      hash: location.hash,
      canvas: {
        clientWidth: canvasRef.current.clientWidth,
        clientHeight: canvasRef.current.clientHeight,
      },
    });
    const handle = createShipScene(canvasRef.current, {
      baseGroundVisible: false,
      loadProceduralScenery: false,
      stopAtLevelEndHold: true,
    });
    handle.setPlayerShipVisible(true);
    handle.setScenery({});
    Promise.all([
      fetch(ASSET_MAP_URL).then((r) => r.json()),
      fetch(ASSET_NORMALIZATION_PRESETS_URL)
        .then((r) => r.json())
        .catch(() => ({})),
      fetch(ASSET_NORMALIZATION_OVERRIDES_URL)
        .then((r) => r.json())
        .catch(() => ({})),
    ])
      .then(([assetMapData, presetData, overrideData]: [Record<string, unknown>, unknown, unknown]) => {
        tjcLog("VerticalTestPlay asset payloads loaded", {
          assetKeys: Object.keys(assetMapData ?? {}),
          presetKeys: presetData && typeof presetData === "object" ? Object.keys(presetData as Record<string, unknown>) : [],
          overrideKeys: overrideData && typeof overrideData === "object" ? Object.keys(overrideData as Record<string, unknown>) : [],
        });
        const assignments = parseAssetAssignments(assetMapData);
        const assignment = assignments["ship-player"] ?? { model: "", preset: "none" as const };
        const playerShip = assetValueToUrl(assignment.model);
        const presets = mergeNormalizationPresets(presetData);
        const overrides = mergeNormalizationOverrides(overrideData);
        const urls: Record<string, string> = {};
        for (const [id, entry] of Object.entries(assignments)) {
          if (id.startsWith("ship-")) continue;
          const url = assetValueToUrl(entry.model);
          if (url) urls[id] = url;
        }
        setAssignedAssetUrlMap(urls);
        if (playerShip) {
          const normalization = resolveAssetNormalization(
            getNormalizationPreset(presets, assignment.preset),
            overrides[assignment.model],
          );
          tjcLog("VerticalTestPlay set player ship", {
            assignment,
            playerShip,
            normalization,
            respectHashShipSize: initialHashParamsRef.current.has("shipSize"),
          });
          dispatch({
            type: "set-player-ship-url",
            url: playerShip,
            respectHashShipSize: initialHashParamsRef.current.has("shipSize"),
          });
          handle.setPlayerShipModel(playerShip, normalization);
        } else {
          tjcLog("VerticalTestPlay no player ship assignment", { assignment });
        }
      })
      .catch((err) => {
        tjcLog("VerticalTestPlay asset payload load failed", err);
        /* keep the default runtime ship if the asset map can't be read */
      });
    sceneRef.current = handle;
    setSceneReady(true);
    return () => {
      sceneRef.current = null;
      handle.dispose();
    };
  }, []);

  useEffect(() => {
    loadStagedModels().then(setModelEntries).catch(() => {});
  }, []);

  useEffect(() => {
    const handle = sceneRef.current;
    if (!sceneReady || !levelLoaded || !handle) return;
    handle.setLevelCells(
      projectObjectsToLegacyCells(level) as LevelGridCell[],
      level.columns,
      level.rows,
      level.cellSize,
      levelAssetUrlMap,
    );
  }, [
    sceneReady,
    levelLoaded,
    level.layers.objects,
    level.layers.height,
    level.columns,
    level.rows,
    level.cellSize,
    levelAssetUrlMap,
  ]);

  useEffect(() => {
    const handle = sceneRef.current;
    if (!sceneReady || !levelLoaded || !handle) return;
    handle.setLevelTerrainRenderWindowRows(
      level.preview.terrainRenderRowsBack,
      level.preview.terrainRenderRowsForward,
    );
  }, [
    sceneReady,
    levelLoaded,
    level.preview.terrainRenderRowsBack,
    level.preview.terrainRenderRowsForward,
  ]);

  useEffect(() => {
    const handle = sceneRef.current;
    if (!sceneReady || !levelLoaded || !handle) return;
    const terrainCells = level.layers.terrain.map((cell) => ({
      terrain: cell.terrain,
      rotation: cell.feature?.rotation ?? cell.rotation,
    }));
    handle.setLevelTerrainCells(
      terrainCells as LevelTerrainCell[],
      level.columns,
      level.rows,
      level.cellSize,
      levelAssetUrlMap,
    );
  }, [
    sceneReady,
    levelLoaded,
    level.layers.terrain,
    level.columns,
    level.rows,
    level.cellSize,
    levelAssetUrlMap,
  ]);

  useEffect(() => {
    const handle = sceneRef.current;
    if (!handle) return;
    tjcLog("VerticalTestPlay apply scene values", {
      cameraMode: state.values.cameraMode,
      altitude: state.values.altitude,
      shipSize: state.values.shipSize,
      pixelLevel: state.values.pixelLevel,
      pipelineMode: state.values.pipelineMode,
      rtHeight: state.values.rtHeight,
      lighting: state.values.lighting,
      sunI: state.values.sunI,
      skyI: state.values.skyI,
      azimuth: state.values.azimuth,
      elevation: state.values.elevation,
    });
    handle.setCameraRotationMode(state.values.cameraMode);
    handle.setShipHeight(state.values.altitude);
    handle.setShipSize(state.values.shipSize);
    handle.setPixelScale(state.values.pixelLevel);
    handle.setRtHeight(state.values.rtHeight);
    handle.setPipelineMode(state.values.pipelineMode);
    handle.setLevelPlan(null);
    handle.setScenery({});
    handle.setLightingPreset(state.values.lighting);
    handle.setSunIntensity(state.values.sunI);
    handle.setSkyIntensity(state.values.skyI);
    handle.setSunAzimuth(state.values.azimuth);
    handle.setSunElevation(state.values.elevation);
    handle.setShipLightDirectIntensity(state.values.shipLight.directIntensity);
    handle.setShipLightEnvironmentIntensity(state.values.shipLight.environmentIntensity);
    handle.setShipLightRoughness(state.values.shipLight.roughness);
    handle.setShipLightSpecularIntensity(state.values.shipLight.specularIntensity);
    handle.setShipLightExposure(state.values.shipLight.exposure);
    handle.setShipLightContrast(state.values.shipLight.contrast);
    handle.setShipLightAlbedoBoost(state.values.shipLight.albedoBoost);
    handle.setShipLightAmbientStrength(state.values.shipLight.ambientStrength);
  }, [state.values]);

  useEffect(() => {
    sceneRef.current?.setLevelScrollPaused(levelPaused);
  }, [levelPaused]);

  useEffect(() => {
    if (!state.hydrated) return;
    const nextHash = serializeVerticalHash(state.values);
    const id = window.setTimeout(() => {
      if (location.hash !== nextHash) {
        history.replaceState(null, "", `${location.pathname}${location.search}${nextHash}`);
      }
    }, HASH_WRITE_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [state.hydrated, state.values]);

  // live ship coordinates + authored level progress
  useEffect(() => {
    const id = setInterval(() => {
      const handle = sceneRef.current;
      setPos(handle?.getShipPosition() ?? null);
      setLevelScrollZ(handle?.getLevelScrollZ() ?? 0);
      setLevelTotalDepth(handle?.getLevelTotalDepth() ?? 0);
    }, 150);
    return () => clearInterval(id);
  }, []);

  const resetToDefaults = () => {
    dispatch({ type: "reset-to-defaults" });
    sceneRef.current?.resetShip();
  };

  function saveDefaults(update: (prev: VerticalDefaults) => VerticalDefaults) {
    const next = update(buildDefaultsFromState(state));
    dispatch({ type: "save-defaults-locally", defaults: next });
    dispatch({ type: "set-save-stamp", stamp: "saving" });
    fetch(VERTICAL_DEFAULTS_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next, null, 2),
    })
      .then(() => dispatch({ type: "set-save-stamp", stamp: "saved" }))
      .catch(() => dispatch({ type: "set-save-stamp", stamp: "error" }));
  }

  const toggleLeft = (id: string) => dispatch({ type: "toggle-left", id });
  const toggleRight = (id: string) => dispatch({ type: "toggle-right", id });
  const levelProgressPct = levelTotalDepth > 0 ? (levelScrollZ / levelTotalDepth) * 100 : 0;

  return (
    <>
      <canvas ref={canvasRef} className="game-canvas" />
      <div className="hud-hint">Arrows / WASD to fly · Shift = boost · P = pixel mode</div>

      {/* left-side controls */}
      <div className="control-stack-left">
        <button className="control-reset" onClick={resetToDefaults}>
          Reset to Defaults
        </button>
        {state.saveStamp && <div className={`save-stamp ${state.saveStamp}`}>{state.saveStamp === "saved" ? "Defaults saved" : state.saveStamp === "saving" ? "Saving…" : "Save failed"}</div>}

        <Panel id="camera-rotation" title="Camera Rotation" className="camera-test-panel" open={state.openLeft === "camera-rotation"} onToggle={toggleLeft}>
          <p>Switch rotation modes while steering left and right.</p>
          <div className="camera-test-buttons">
            {CAMERA_ROTATIONS.map((t) => (
              <button
                key={t.mode}
                type="button"
                className={t.mode === state.values.cameraMode ? "active" : ""}
                onClick={() => dispatch({ type: "set-camera-mode", mode: t.mode })}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            className="panel-save"
            onClick={() => saveDefaults((prev) => ({ ...prev, cameraMode: state.values.cameraMode }))}
          >
            Save Defaults
          </button>
        </Panel>

        <Panel id="ship-size" title="Ship Size" className="ship-size-panel" open={state.openLeft === "ship-size"} onToggle={toggleLeft}>
          <div className="slider-readout">{state.values.shipSize.toFixed(1)}</div>
          <input
            type="range"
            className="v-slider"
            min={0.5}
            max={12}
            step={0.1}
            value={state.values.shipSize}
            onChange={(e) => dispatch({ type: "set-ship-size", shipSize: parseFloat(e.target.value) })}
            aria-label="Ship size"
          />
          <button
            className="panel-save"
            onClick={() =>
              saveDefaults((prev) => ({
                ...prev,
                shipSize: state.values.shipSize,
                shipSizeByModel: state.shipSizeByModel,
              }))
            }
          >
            Save Defaults
          </button>
        </Panel>

        <Panel id="ship-altitude" title="Ship Altitude" className="ship-altitude-panel" open={state.openLeft === "ship-altitude"} onToggle={toggleLeft}>
          <div className="slider-readout">{state.values.altitude.toFixed(1)}</div>
          <input
            type="range"
            className="v-slider"
            min={1}
            max={100}
            step={0.5}
            value={state.values.altitude}
            onChange={(e) => dispatch({ type: "set-altitude", altitude: parseFloat(e.target.value) })}
            aria-label="Ship altitude"
          />
          <button
            className="panel-save"
            onClick={() => saveDefaults((prev) => ({ ...prev, altitude: state.values.altitude }))}
          >
            Save Defaults
          </button>
        </Panel>

        <Panel id="ship-lighting" title="Ship Lighting" className="lighting-panel" open={state.openLeft === "ship-lighting"} onToggle={toggleLeft}>
          <div className="light-sliders">
            <LightSlider label="Direct" title="How strongly the sun hits the ship" value={state.values.shipLight.directIntensity} min={0} max={6} step={0.05} onChange={(v) => dispatch({ type: "set-ship-light", patch: { directIntensity: v } })} />
            <LightSlider label="Env" title="Environment / ambient contribution on the ship" value={state.values.shipLight.environmentIntensity} min={0} max={1} step={0.01} onChange={(v) => dispatch({ type: "set-ship-light", patch: { environmentIntensity: v } })} />
            <LightSlider label="Rough" title="Surface roughness; lower = sharper light read" value={state.values.shipLight.roughness} min={0} max={1} step={0.01} onChange={(v) => dispatch({ type: "set-ship-light", patch: { roughness: v } })} />
            <LightSlider label="Spec" title="Specular response on the ship" value={state.values.shipLight.specularIntensity} min={0} max={3} step={0.05} onChange={(v) => dispatch({ type: "set-ship-light", patch: { specularIntensity: v } })} />
            <LightSlider label="Expose" title="Material exposure on the ship" value={state.values.shipLight.exposure} min={0.2} max={3} step={0.05} onChange={(v) => dispatch({ type: "set-ship-light", patch: { exposure: v } })} />
            <LightSlider label="Contrast" title="Material contrast on the ship" value={state.values.shipLight.contrast} min={0.5} max={2} step={0.05} onChange={(v) => dispatch({ type: "set-ship-light", patch: { contrast: v } })} />
            <LightSlider label="Albedo" title="Base ship brightness / texture boost" value={state.values.shipLight.albedoBoost} min={0.2} max={2} step={0.05} onChange={(v) => dispatch({ type: "set-ship-light", patch: { albedoBoost: v } })} />
            <LightSlider label="Ambient" title="Extra fill on the ship materials" value={state.values.shipLight.ambientStrength} min={0} max={1} step={0.01} onChange={(v) => dispatch({ type: "set-ship-light", patch: { ambientStrength: v } })} />
          </div>
          <button
            className="panel-save"
            onClick={() => saveDefaults((prev) => ({ ...prev, shipLight: { ...state.values.shipLight } }))}
          >
            Save Defaults
          </button>
        </Panel>

        <Panel id="ship-position" title="Ship Position" className="ship-pos-panel" open={state.openLeft === "ship-position"} onToggle={toggleLeft}>
          <div className="pos-grid">
            <span>x</span>
            <b>{pos ? pos.x.toFixed(2) : "—"}</b>
            <span>y</span>
            <b>{pos ? pos.y.toFixed(2) : "—"}</b>
            <span>z</span>
            <b>{pos ? pos.z.toFixed(2) : "—"}</b>
          </div>
          <button className="pos-reset" onClick={() => sceneRef.current?.resetShip()}>
            Reset to start
          </button>
          <p className="pos-hint">Fly to a spot, then report these.</p>
        </Panel>
      </div>

      {/* right-side controls */}
      <div className="control-stack">
        <Panel id="level-run" title="Level Run" className="zone-panel" open={state.openRight === "level-run"} onToggle={toggleRight}>
          <button
            className={`zone-play ${!levelPaused ? "on" : ""}`}
            onClick={() => setLevelPaused((current) => !current)}
          >
            {levelPaused ? "▶ Resume Level" : "■ Pause Level"}
          </button>
          <div className="zone-status">
            {Math.round(levelProgressPct)}% · {levelScrollZ.toFixed(0)}/{levelTotalDepth.toFixed(0)}wu
          </div>
          <button
            className="zone-add"
            onClick={() => {
              sceneRef.current?.setLevelScrollZ(0);
              sceneRef.current?.resetShip();
              setLevelScrollZ(0);
            }}
          >
            Restart run
          </button>
        </Panel>

        <Panel id="lighting" title="Lighting" className="lighting-panel" open={state.openRight === "lighting"} onToggle={toggleRight}>
          <div className="camera-test-buttons">
            {LIGHTING_PRESETS.map((l) => (
              <button
                key={l.id}
                type="button"
                className={l.id === state.values.lighting ? "active" : ""}
                onClick={() => dispatch({ type: "set-lighting-preset", lighting: l.id })}
              >
                {l.label}
              </button>
            ))}
          </div>
          <div className="light-sliders">
            <LightSlider label="Sun" title="Sun (key light) intensity" value={state.values.sunI} min={0} max={3} step={0.05} onChange={(v) => dispatch({ type: "sync-lighting-from-scene", sunI: v, skyI: state.values.skyI, azimuth: state.values.azimuth, elevation: state.values.elevation })} />
            <LightSlider label="Sky" title="Sky / ambient fill intensity" value={state.values.skyI} min={0} max={2} step={0.05} onChange={(v) => dispatch({ type: "sync-lighting-from-scene", sunI: state.values.sunI, skyI: v, azimuth: state.values.azimuth, elevation: state.values.elevation })} />
            <LightSlider label="Angle" title="Sun compass direction" value={state.values.azimuth} min={0} max={360} step={1} digits={0} suffix="°" onChange={(v) => dispatch({ type: "sync-lighting-from-scene", sunI: state.values.sunI, skyI: state.values.skyI, azimuth: v, elevation: state.values.elevation })} />
            <LightSlider label="Height" title="Sun height above the horizon" value={state.values.elevation} min={5} max={90} step={1} digits={0} suffix="°" onChange={(v) => dispatch({ type: "sync-lighting-from-scene", sunI: state.values.sunI, skyI: state.values.skyI, azimuth: state.values.azimuth, elevation: v })} />
          </div>
          <button
            className="panel-save"
            onClick={() =>
              saveDefaults((prev) => ({
                ...prev,
                lighting: state.values.lighting,
                sunI: state.values.sunI,
                skyI: state.values.skyI,
                azimuth: state.values.azimuth,
                elevation: state.values.elevation,
              }))
            }
          >
            Save Defaults
          </button>
        </Panel>

        <Panel id="pixelate" title="Pixelate" open={state.openRight === "pixelate"} onToggle={toggleRight}>
          <div className="camera-test-buttons">
            {PIXEL_LEVELS.map((p) => (
              <button
                key={p.level}
                type="button"
                className={p.level === state.values.pixelLevel ? "active" : ""}
                onClick={() => dispatch({ type: "set-pixel-level", pixelLevel: p.level })}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            className="panel-save"
            onClick={() => saveDefaults((prev) => ({ ...prev, pixelLevel: state.values.pixelLevel }))}
          >
            Save Defaults
          </button>
        </Panel>

        <Panel
          id="render-pipeline"
          title="Render Pipeline"
          open={state.openRight === "render-pipeline"}
          onToggle={toggleRight}
        >
          <p className="pos-hint" style={{ margin: "0 0 6px" }}>
            Pixel-art spike. Low-res = engine renders to a small buffer; mode
            picks how the browser upscales. Nearest = crisp pixels.
          </p>
          <div className="camera-test-buttons">
            {PIPELINE_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={m.id === state.values.pipelineMode ? "active" : ""}
                onClick={() => dispatch({ type: "set-pipeline-mode", mode: m.id })}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="pos-hint" style={{ margin: "10px 0 4px" }}>
            Target render-buffer height (only used in low-res modes).
          </p>
          <div className="camera-test-buttons">
            {RT_HEIGHTS.map((r) => (
              <button
                key={r.h}
                type="button"
                className={r.h === state.values.rtHeight ? "active" : ""}
                onClick={() => dispatch({ type: "set-rt-height", h: r.h })}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            className="panel-save"
            onClick={() =>
              saveDefaults((prev) => ({
                ...prev,
                pipelineMode: state.values.pipelineMode,
                rtHeight: state.values.rtHeight,
              }))
            }
          >
            Save Defaults
          </button>
        </Panel>
      </div>
    </>
  );
}
