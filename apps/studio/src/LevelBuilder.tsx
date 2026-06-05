import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent,
} from "react";
import {
  createShipScene,
  SCROLL,
  type LevelGridCell,
  type LevelTerrainCell,
  type SceneHandle,
} from "@tjc/scenes";
import {
  assetValueToUrl,
  getAssignedModelValue,
  parseAssetAssignments,
} from "./asset-normalization";
import {
  cellIndex,
  COLUMN_OPTIONS,
  countPaintedCells,
  emptyLevel,
  makePlacementId,
  MAX_HEIGHT,
  mergeLevel,
  projectObjectsToLegacyCells,
  type Level,
} from "./level-builder-state";
import { SLOTS } from "./slots";
import { loadStagedModels, type ModelEntry } from "./models";
import {
  buildModelCatalog,
  EMPTY_MODEL_CATALOG_OVERRIDES,
  MODEL_CATEGORY_LABELS,
  parseModelCatalogOverrides,
  type ModelCatalogItem,
  type ModelCatalogOverrides,
} from "./model-catalog";
import { usePersistedJson } from "./use-persisted-json";

const LEVEL_URL = "/__level-builder";
const ASSET_MAP_URL = "/__asset-map";
const MODEL_CATALOG_OVERRIDES_URL = "/__model-catalog-overrides";

type PaintMode = "terrain" | "object" | "height" | "erase";

const PAINT_MODES: Array<{ id: PaintMode; label: string }> = [
  { id: "terrain", label: "Terrain" },
  { id: "object", label: "Objects" },
  { id: "height", label: "Height" },
  { id: "erase", label: "Erase" },
];

const HEIGHT_LEVELS = Array.from({ length: MAX_HEIGHT + 1 }, (_, i) => i);

const SLOT_COLORS = [
  "#7fc97f", "#beaed4", "#fdc086", "#ffff99", "#386cb0",
  "#f0027f", "#bf5b17", "#666666", "#a6cee3", "#fb9a99",
];

export function LevelBuilder() {
  const { value: level, setValue: setLevel, saved, loaded } = usePersistedJson(
    LEVEL_URL,
    emptyLevel(),
    mergeLevel,
  );
  const [mode, setMode] = useState<PaintMode>("terrain");
  const [selectedTerrain, setSelectedTerrain] = useState("");
  const [selectedObject, setSelectedObject] = useState("");
  const [selectedHeight, setSelectedHeight] = useState(1);
  const [assignedSlots, setAssignedSlots] = useState<string[]>([]);
  const [legacyAssetUrlMap, setLegacyAssetUrlMap] = useState<Record<string, string>>({});
  const [modelEntries, setModelEntries] = useState<ModelEntry[]>([]);
  const [paused, setPaused] = useState(true);
  const [scrollZ, setScrollZ] = useState(0);
  const [fps, setFps] = useState(0);
  const [pendingClear, setPendingClear] = useState(false);
  const [pendingColumns, setPendingColumns] = useState<number | null>(null);

  const pointerDown = useRef(false);
  const pausedBeforeScrub = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<SceneHandle | null>(null);
  const rafRef = useRef<number | null>(null);
  const catalogOverrides = usePersistedJson<ModelCatalogOverrides>(
    MODEL_CATALOG_OVERRIDES_URL,
    EMPTY_MODEL_CATALOG_OVERRIDES,
    parseModelCatalogOverrides,
  );

  useEffect(() => {
    fetch(ASSET_MAP_URL)
      .then((r) => r.json())
      .then((data) => {
        const assignments = parseAssetAssignments(data);
        const slots = SLOTS.flatMap((category) => category.slots)
          .map((slot) => slot.id)
          .filter((id) => getAssignedModelValue(assignments[id]) && !id.startsWith("ship-"));

        setAssignedSlots(slots);

        const urls: Record<string, string> = {};
        for (const id of slots) {
          const url = assetValueToUrl(getAssignedModelValue(assignments[id]));
          if (url) urls[id] = url;
        }
        setLegacyAssetUrlMap(urls);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadStagedModels().then(setModelEntries).catch(() => {});
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const handle = createShipScene(canvasRef.current);
    handleRef.current = handle;
    handle.setPlayerShipVisible(false);
    handle.setLevelScrollPaused(true);
    handle.setGroundStyle("white");
    return () => {
      handle.dispose();
      handleRef.current = null;
    };
  }, []);

  const catalog = useMemo(
    () => buildModelCatalog(modelEntries, catalogOverrides.value),
    [modelEntries, catalogOverrides.value],
  );
  const catalogTerrainItems = useMemo(
    () => catalog.filter((m) => m.usage.showInLevelBuilder && m.usage.terrain),
    [catalog],
  );
  const catalogObjectItems = useMemo(
    () => catalog.filter((m) => m.usage.showInLevelBuilder && m.usage.object),
    [catalog],
  );
  const assetUrlMap = useMemo(() => {
    const urls: Record<string, string> = { ...legacyAssetUrlMap };
    for (const model of catalog) urls[model.modelValue] = model.url;
    return urls;
  }, [legacyAssetUrlMap, catalog]);

  const paletteIds = useMemo(
    () => [
      ...catalogTerrainItems.map((m) => m.modelValue),
      ...catalogObjectItems.map((m) => m.modelValue),
    ],
    [catalogTerrainItems, catalogObjectItems],
  );

  const slotColor = useMemo(() => {
    const colors: Record<string, string> = {};
    paletteIds.forEach((id, i) => {
      colors[id] = SLOT_COLORS[i % SLOT_COLORS.length];
    });
    return colors;
  }, [paletteIds]);

  useEffect(() => {
    setSelectedTerrain((current) => current || catalogTerrainItems[0]?.modelValue || "");
    setSelectedObject((current) => current || catalogObjectItems[0]?.modelValue || "");
  }, [catalogTerrainItems, catalogObjectItems]);

  useEffect(() => {
    if (!loaded || !handleRef.current) return;
    handleRef.current.setLevelCells(
      projectObjectsToLegacyCells(level) as LevelGridCell[],
      level.columns,
      level.rows,
      level.cellSize,
      assetUrlMap,
    );
    const terrainPreviewCells = level.layers.terrain.map((cell) => ({
      terrain: cell.terrain,
      color: cell.terrain ? slotColor[cell.terrain] : undefined,
    }));
    handleRef.current.setLevelTerrainCells(
      terrainPreviewCells as LevelTerrainCell[],
      level.columns,
      level.rows,
      level.cellSize,
      assetUrlMap,
    );
  }, [level, assetUrlMap, loaded, slotColor]);

  useEffect(() => {
    handleRef.current?.setLevelScrollPaused(paused);
  }, [paused]);

  useEffect(() => {
    function tick() {
      const h = handleRef.current;
      setScrollZ(h?.getLevelScrollZ() ?? 0);
      setFps(Math.round(h?.getFps() ?? 0));
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const catalogLabelMap = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const model of catalog) labels[model.modelValue] = `${model.name} · ${MODEL_CATEGORY_LABELS[model.categoryKind]}`;
    return labels;
  }, [catalog]);
  const paletteSlots = mode === "terrain"
    ? catalogTerrainItems.map((m) => m.modelValue)
    : mode === "object"
      ? catalogObjectItems.map((m) => m.modelValue)
      : [];
  const totalDepth = level.rows * level.cellSize;
  const progressRow = Math.min(level.rows - 1, Math.floor(scrollZ / level.cellSize));
  const currentGridRow = level.rows - 1 - progressRow;
  const progressPct = totalDepth > 0 ? (scrollZ / totalDepth) * 100 : 0;
  const cols = useMemo(() => Array.from({ length: level.columns }, (_, i) => i), [level.columns]);
  const filledCount = useMemo(() => countPaintedCells(level), [level]);
  const selectedLabel = labelForSelection(
    mode,
    catalogLabelMap[selectedTerrain] ?? selectedTerrain,
    catalogLabelMap[selectedObject] ?? selectedObject,
    selectedHeight,
  );

  function paintCell(col: number, row: number) {
    const i = cellIndex(level, col, row);
    if (i < 0) return;
    if (mode === "terrain") paintTerrain(i);
    else if (mode === "object") paintObject(i, col, row);
    else if (mode === "height") paintHeight(i);
    else eraseCell(i);
  }

  function paintTerrain(i: number) {
    if (!selectedTerrain || level.layers.terrain[i]?.terrain === selectedTerrain) return;
    const terrain = [...level.layers.terrain];
    terrain[i] = { terrain: selectedTerrain };
    setLevel({ ...level, layers: { ...level.layers, terrain } });
  }

  function paintObject(i: number, col: number, row: number) {
    if (!selectedObject || level.layers.objects[i]?.objects?.[0]?.slot === selectedObject) return;
    const objects = [...level.layers.objects];
    objects[i] = {
      objects: [{ id: makePlacementId(col, row, selectedObject), slot: selectedObject }],
    };
    setLevel({ ...level, layers: { ...level.layers, objects } });
  }

  function paintHeight(i: number) {
    if (level.layers.height[i]?.height === selectedHeight) return;
    const height = [...level.layers.height];
    height[i] = selectedHeight > 0 ? { height: selectedHeight } : {};
    setLevel({ ...level, layers: { ...level.layers, height } });
  }

  function eraseCell(i: number) {
    if (
      !level.layers.terrain[i]?.terrain &&
      !level.layers.height[i]?.height &&
      !level.layers.objects[i]?.objects?.length
    ) return;
    const terrain = [...level.layers.terrain];
    const height = [...level.layers.height];
    const objects = [...level.layers.objects];
    terrain[i] = {};
    height[i] = {};
    objects[i] = {};
    setLevel({ ...level, layers: { terrain, height, objects } });
  }

  function resetLevel() {
    setLevel(emptyLevel({
      columns: level.columns,
      durationSec: level.durationSec,
      fieldWidth: level.fieldWidth,
      scrollSpeed: level.scrollSpeed,
    }));
    setPendingClear(false);
  }

  function rebuildForColumns(columns: number) {
    setLevel(emptyLevel({
      columns,
      durationSec: level.durationSec,
      fieldWidth: level.fieldWidth,
      scrollSpeed: level.scrollSpeed,
    }));
    setPendingColumns(null);
    handleRef.current?.setLevelScrollZ(0);
  }

  function scrubTo(z: number) {
    setScrollZ(z);
    handleRef.current?.setLevelScrollZ(z);
  }

  function startScrub() {
    pausedBeforeScrub.current = paused;
    setPaused(true);
    handleRef.current?.setLevelScrollPaused(true);
  }

  function endScrub() {
    const nextPaused = pausedBeforeScrub.current;
    setPaused(nextPaused);
    handleRef.current?.setLevelScrollPaused(nextPaused);
  }

  return (
    <div className="lb-page">
      <canvas ref={canvasRef} className="lb-bg-canvas" />
      <div className="lb-preview-shade" />

      <aside className="lb-panel lb-panel-left">
        <HeaderPanel level={level} filled={filledCount} saved={saved} fps={fps} />
        <LevelSettings
          level={level}
          totalDepth={totalDepth}
          onColumnsChange={(columns) => {
            if (columns !== level.columns) setPendingColumns(columns);
          }}
        />
        {pendingColumns != null && (
          <ColumnChangeConfirm
            columns={pendingColumns}
            onCancel={() => setPendingColumns(null)}
            onConfirm={() => rebuildForColumns(pendingColumns)}
          />
        )}
        <PaintPanel
          mode={mode}
          selectedLabel={selectedLabel}
          pendingClear={pendingClear}
          onModeChange={setMode}
          onRequestClear={() => setPendingClear(true)}
          onCancelClear={() => setPendingClear(false)}
          onConfirmClear={resetLevel}
        />
        <PalettePanel
          loaded={loaded}
          mode={mode}
          paletteSlots={paletteSlots}
          slotColor={slotColor}
          selectedTerrain={selectedTerrain}
          selectedObject={selectedObject}
          selectedHeight={selectedHeight}
          catalogLabelMap={catalogLabelMap}
          onModeChange={setMode}
          onTerrainSelect={setSelectedTerrain}
          onObjectSelect={setSelectedObject}
          onHeightSelect={setSelectedHeight}
        />
      </aside>

      <aside className="lb-panel lb-panel-right">
        <PreviewPanel
          paused={paused}
          progressPct={progressPct}
          progressRow={progressRow}
          level={level}
          totalDepth={totalDepth}
          scrollZ={scrollZ}
          onPausedChange={setPaused}
          onScrubStart={startScrub}
          onScrub={scrubTo}
          onScrubEnd={endScrub}
        />
        <GridPanel
          mode={mode}
          level={level}
          cols={cols}
          currentGridRow={currentGridRow}
          slotColor={slotColor}
          pointerDown={pointerDown}
          onPaintCell={paintCell}
        />
      </aside>
    </div>
  );
}

function HeaderPanel({ level, filled, saved, fps }: { level: Level; filled: number; saved: boolean; fps: number }) {
  return (
    <header className="lb-sidebar-head">
      <h1>Level Builder</h1>
      <p className="dim">
        {level.columns}×{level.rows} grid · {level.cellSize.toFixed(1)}wu/cell ·{" "}
        {filled}/{level.columns * level.rows} filled · {saved ? "✓" : "saving…"}
      </p>
      <p className="dim">
        <b className={`lb-fps ${fps < 30 ? "lb-fps-bad" : fps < 50 ? "lb-fps-warn" : "lb-fps-good"}`}>
          {fps} fps
        </b>
      </p>
    </header>
  );
}

function LevelSettings({
  level,
  totalDepth,
  onColumnsChange,
}: {
  level: Level;
  totalDepth: number;
  onColumnsChange: (columns: number) => void;
}) {
  return (
    <section className="lb-section">
      <h2>Level</h2>
      <div className="lb-settings-grid">
        <label>
          <span>Columns</span>
          <select value={level.columns} onChange={(e) => onColumnsChange(Number(e.target.value))}>
            {COLUMN_OPTIONS.map((columns) => (
              <option key={columns} value={columns}>{columns}</option>
            ))}
          </select>
        </label>
        <Readout label="Duration" value={formatTime(level.durationSec)} />
        <Readout label="World depth" value={`${Math.round(totalDepth)}wu`} />
        <Readout label="Cell size" value={`${level.cellSize.toFixed(1)}wu`} />
      </div>
    </section>
  );
}

function ColumnChangeConfirm({
  columns,
  onCancel,
  onConfirm,
}: {
  columns: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <section className="lb-section">
      <div className="confirm-box lb-confirm-box">
        <div className="confirm-title">Resize Grid</div>
        <p>
          Rebuild the level with {columns} columns. This changes cell size and
          clears the current painted layers.
        </p>
        <div className="confirm-actions">
          <button className="panel-save" onClick={onCancel}>Cancel</button>
          <button className="panel-save confirm-accept" onClick={onConfirm}>Rebuild</button>
        </div>
      </div>
    </section>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <b>{label}</b>
      <span>{value}</span>
    </div>
  );
}

function PaintPanel({
  mode,
  selectedLabel,
  pendingClear,
  onModeChange,
  onRequestClear,
  onCancelClear,
  onConfirmClear,
}: {
  mode: PaintMode;
  selectedLabel: string;
  pendingClear: boolean;
  onModeChange: (mode: PaintMode) => void;
  onRequestClear: () => void;
  onCancelClear: () => void;
  onConfirmClear: () => void;
}) {
  return (
    <section className="lb-section">
      <h2>Paint</h2>
      <div className="lb-toolbar">
        <div className="lb-tool-group">
          <span className="lb-tool-label">Mode</span>
          {PAINT_MODES.map((item) => (
            <button
              key={item.id}
              className={mode === item.id ? "on" : ""}
              onClick={() => onModeChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="lb-current-tool">
        <span className="lb-tool-label">Current</span>
        <b>{selectedLabel}</b>
      </div>
      <button className="lb-reset" onClick={onRequestClear}>Clear Level</button>
      {pendingClear && (
        <div className="confirm-box lb-confirm-box">
          <div className="confirm-title">Clear Level</div>
          <p>Remove every painted terrain, object, and height cell. This will autosave immediately.</p>
          <div className="confirm-actions">
            <button className="panel-save" onClick={onCancelClear}>Cancel</button>
            <button className="panel-save confirm-accept" onClick={onConfirmClear}>Clear</button>
          </div>
        </div>
      )}
    </section>
  );
}

function PalettePanel({
  loaded,
  mode,
  paletteSlots,
  slotColor,
  selectedTerrain,
  selectedObject,
  selectedHeight,
  catalogLabelMap,
  onModeChange,
  onTerrainSelect,
  onObjectSelect,
  onHeightSelect,
}: {
  loaded: boolean;
  mode: PaintMode;
  paletteSlots: string[];
  slotColor: Record<string, string>;
  selectedTerrain: string;
  selectedObject: string;
  selectedHeight: number;
  catalogLabelMap: Record<string, string>;
  onModeChange: (mode: PaintMode) => void;
  onTerrainSelect: (id: string) => void;
  onObjectSelect: (id: string) => void;
  onHeightSelect: (height: number) => void;
}) {
  return (
    <section className="lb-palette lb-section">
      <h2>Palette</h2>
      {!loaded && <p className="dim">Loading…</p>}
      {loaded && mode === "height" && (
        <div className="lb-height-palette">
          {HEIGHT_LEVELS.map((h) => (
            <button
              key={h}
              className={`lb-height-swatch ${selectedHeight === h ? "on" : ""}`}
              onClick={() => {
                onModeChange("height");
                onHeightSelect(h);
              }}
              style={{ opacity: 0.2 + (h / MAX_HEIGHT) * 0.8 }}
            >
              {h}
            </button>
          ))}
        </div>
      )}
      {loaded && mode !== "height" && paletteSlots.length === 0 && (
        <p className="dim">No matching curated models yet. Go to <b>3D Models</b> first.</p>
      )}
      {mode !== "height" && (
        <div className="lb-palette-list">
          {paletteSlots.map((id) => {
            const selected = mode === "terrain" ? selectedTerrain === id : selectedObject === id;
            return (
              <button
                key={id}
                className={`lb-palette-item ${selected ? "on" : ""}`}
                onClick={() => {
                  if (mode === "terrain") {
                    onModeChange("terrain");
                    onTerrainSelect(id);
                  } else {
                    onModeChange("object");
                    onObjectSelect(id);
                  }
                }}
                title={id}
              >
                <span className="lb-swatch" style={{ background: slotColor[id] }} />
                {catalogLabelMap[id] ?? id}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function PreviewPanel({
  paused,
  progressPct,
  progressRow,
  level,
  totalDepth,
  scrollZ,
  onPausedChange,
  onScrubStart,
  onScrub,
  onScrubEnd,
}: {
  paused: boolean;
  progressPct: number;
  progressRow: number;
  level: Level;
  totalDepth: number;
  scrollZ: number;
  onPausedChange: (paused: boolean) => void;
  onScrubStart: () => void;
  onScrub: (z: number) => void;
  onScrubEnd: () => void;
}) {
  const elapsedSeconds = scrollZ / SCROLL;
  const levelSeconds = totalDepth / SCROLL;
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  function scrollFromClientX(clientX: number) {
    const track = trackRef.current;
    if (!track || totalDepth <= 0) return;
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    onScrub(pct * totalDepth);
  }

  function handleTrackPointerDown(e: PointerEvent<HTMLDivElement>) {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    onScrubStart();
    scrollFromClientX(e.clientX);
  }

  function handleTrackPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    scrollFromClientX(e.clientX);
  }

  function handleTrackPointerEnd(e: PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    onScrubEnd();
  }

  return (
    <section className="lb-section lb-preview-section">
      <h2>Preview</h2>
      <div className="lb-preview-bar">
        <button className={paused ? "" : "on"} onClick={() => onPausedChange(!paused)}>
          {paused ? "Play" : "Pause"}
        </button>
        <span className="dim lb-row-label">{Math.round(progressPct)}%</span>
      </div>
      <div
        ref={trackRef}
        className="lb-scrub-track"
        role="slider"
        tabIndex={0}
        aria-label="Preview scroll"
        aria-valuemin={0}
        aria-valuemax={Math.round(totalDepth)}
        aria-valuenow={Math.round(scrollZ)}
        onPointerDown={handleTrackPointerDown}
        onPointerMove={handleTrackPointerMove}
        onPointerUp={handleTrackPointerEnd}
        onPointerCancel={handleTrackPointerEnd}
        onLostPointerCapture={handleTrackPointerEnd}
      >
        <span className="lb-scrub-fill" style={{ width: `${progressPct}%` }} />
        <span className="lb-scrub-thumb" style={{ left: `${progressPct}%` }} />
      </div>
      <div className="lb-preview-readout">
        <span><b>Row</b> {progressRow + 1}/{level.rows}</span>
        <span><b>Distance</b> {Math.round(scrollZ)}/{Math.round(totalDepth)}wu</span>
        <span><b>Time</b> {elapsedSeconds.toFixed(1)}/{levelSeconds.toFixed(1)}s</span>
      </div>
    </section>
  );
}

// Row height must match --lb-cell-h in styles.css.
const VIRTUAL_ROW_H = 20;
const VIRTUAL_OVERSCAN = 4;

function GridPanel({
  mode,
  level,
  cols,
  currentGridRow,
  slotColor,
  pointerDown,
  onPaintCell,
}: {
  mode: PaintMode;
  level: Level;
  cols: number[];
  currentGridRow: number;
  slotColor: Record<string, string>;
  pointerDown: MutableRefObject<boolean>;
  onPaintCell: (col: number, row: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [firstRow, setFirstRow] = useState(0);
  const [lastRow, setLastRow] = useState(60);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    function update() {
      const el = wrapRef.current;
      if (!el) return;
      const first = Math.max(0, Math.floor(el.scrollTop / VIRTUAL_ROW_H) - VIRTUAL_OVERSCAN);
      const last = Math.min(level.rows, Math.ceil((el.scrollTop + el.clientHeight) / VIRTUAL_ROW_H) + VIRTUAL_OVERSCAN);
      setFirstRow(first);
      setLastRow(last);
    }

    update();
    wrap.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    return () => { wrap.removeEventListener("scroll", update); ro.disconnect(); };
  }, [level.rows]);

  const totalH = level.rows * VIRTUAL_ROW_H;
  const offsetTop = firstRow * VIRTUAL_ROW_H;
  const templateCols = `var(--lb-row-gutter) repeat(${level.columns}, minmax(0, 1fr))`;

  return (
    <section className="lb-section lb-grid-section">
      <div className="lb-grid-title">
        <h2>Grid</h2>
        <span className="dim">{level.columns}×{level.rows}</span>
      </div>
      <div ref={wrapRef} className="lb-grid-wrap">
        {/* Full-height spacer so the scrollbar reflects the total level height */}
        <div style={{ height: totalH, position: "relative" }}>
          {/* Only the visible window of rows, absolutely positioned */}
          <div
            className="lb-grid"
            style={{
              position: "absolute",
              top: offsetTop,
              left: 0,
              right: 0,
              gridTemplateColumns: templateCols,
            }}
            onPointerUp={() => { pointerDown.current = false; }}
            onPointerLeave={() => { pointerDown.current = false; }}
          >
            {Array.from({ length: lastRow - firstRow }, (_, i) => firstRow + i).map((row) => (
              <Fragment key={`row-${row}`}>
                <div className={`lb-row-gutter${row === currentGridRow ? " lb-row-gutter-current" : ""}`}>
                  {row === currentGridRow ? "▲" : level.rows - row}
                </div>
                {cols.map((col) => (
                  <GridCell
                    key={`${col}-${row}`}
                    col={col}
                    row={row}
                    mode={mode}
                    level={level}
                    current={row === currentGridRow}
                    slotColor={slotColor}
                    pointerDown={pointerDown}
                    onPaintCell={onPaintCell}
                  />
                ))}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function GridCell({
  col,
  row,
  mode,
  level,
  current,
  slotColor,
  pointerDown,
  onPaintCell,
}: {
  col: number;
  row: number;
  mode: PaintMode;
  level: Level;
  current: boolean;
  slotColor: Record<string, string>;
  pointerDown: MutableRefObject<boolean>;
  onPaintCell: (col: number, row: number) => void;
}) {
  const i = cellIndex(level, col, row);
  const terrain = level.layers.terrain[i]?.terrain;
  const object = level.layers.objects[i]?.objects?.[0]?.slot;
  const height = level.layers.height[i]?.height ?? 0;
  const background = cellBackgroundForMode(mode, terrain, object, height, slotColor);

  return (
    <button
      className={`lb-cell lb-cell-${mode}${current ? " lb-cell-current-row" : ""}`}
      type="button"
      style={{ background }}
      title={cellTitle(col, row, terrain, object, height)}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        pointerDown.current = true;
        onPaintCell(col, row);
      }}
      onPointerEnter={() => {
        if (pointerDown.current) onPaintCell(col, row);
      }}
    >
      {(mode === "object" || mode === "erase") && object && <span className="lb-object-dot" />}
      {mode === "terrain" && object && <span className="lb-object-ghost" />}
    </button>
  );
}

function labelForSelection(
  mode: PaintMode,
  terrain: string,
  object: string,
  height: number,
): string {
  if (mode === "terrain") return terrain || "No terrain selected";
  if (mode === "object") return object || "No object selected";
  if (mode === "height") return `Height ${height}`;
  return "Erase all layers";
}

function formatTime(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

function cellBackgroundForMode(
  mode: PaintMode,
  terrain: string | undefined,
  object: string | undefined,
  height: number,
  slotColor: Record<string, string>,
): string | undefined {
  if (mode === "terrain") return terrain ? slotColor[terrain] ?? "var(--ui-color-selection)" : undefined;
  if (mode === "object") return object ? slotColor[object] ?? "var(--ui-color-warning)" : undefined;
  if (mode === "height") return height ? heightColor(height) : undefined;
  if (object) return slotColor[object] ?? "var(--ui-color-warning)";
  if (terrain) return slotColor[terrain] ?? "var(--ui-color-selection)";
  return height ? heightColor(height, 0.72) : undefined;
}

function heightColor(height: number, maxAlpha = 0.88): string {
  const alpha = 0.12 + (height / MAX_HEIGHT) * maxAlpha;
  return `rgba(0,0,0,${alpha})`;
}

function cellTitle(
  col: number,
  row: number,
  terrain: string | undefined,
  object: string | undefined,
  height: number,
): string {
  const parts = [`[${col},${row}]`];
  if (terrain) parts.push(`terrain=${terrain}`);
  if (object) parts.push(`object=${object}`);
  if (height) parts.push(`h=${height}`);
  return parts.join(" · ");
}
