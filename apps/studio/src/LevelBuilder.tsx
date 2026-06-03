import { Fragment, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import {
  createShipScene,
  SCROLL,
  type LevelGridCell,
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
import { usePersistedJson } from "./use-persisted-json";

const LEVEL_URL = "/__level-builder";
const ASSET_MAP_URL = "/__asset-map";

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
  const [assetUrlMap, setAssetUrlMap] = useState<Record<string, string>>({});
  const [paused, setPaused] = useState(false);
  const [scrollZ, setScrollZ] = useState(0);
  const [pendingClear, setPendingClear] = useState(false);
  const [pendingColumns, setPendingColumns] = useState<number | null>(null);

  const pointerDown = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<SceneHandle | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    fetch(ASSET_MAP_URL)
      .then((r) => r.json())
      .then((data) => {
        const assignments = parseAssetAssignments(data);
        const slots = SLOTS.flatMap((category) => category.slots)
          .map((slot) => slot.id)
          .filter((id) => getAssignedModelValue(assignments[id]) && !id.startsWith("ship-"));

        setAssignedSlots(slots);
        setSelectedTerrain((current) => current || slots.find(isTerrainSlot) || "");
        setSelectedObject((current) => current || slots.find(isObjectSlot) || "");

        const urls: Record<string, string> = {};
        for (const id of slots) {
          const url = assetValueToUrl(getAssignedModelValue(assignments[id]));
          if (url) urls[id] = url;
        }
        setAssetUrlMap(urls);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const handle = createShipScene(canvasRef.current);
    handleRef.current = handle;
    handle.setPlayerShipVisible(false);
    handle.setLevelScrollPaused(false);
    return () => {
      handle.dispose();
      handleRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!loaded || !handleRef.current) return;
    handleRef.current.setLevelCells(
      projectObjectsToLegacyCells(level) as LevelGridCell[],
      level.columns,
      level.rows,
      level.cellSize,
      assetUrlMap,
    );
  }, [level, assetUrlMap, loaded]);

  useEffect(() => {
    handleRef.current?.setLevelScrollPaused(paused);
  }, [paused]);

  useEffect(() => {
    function tick() {
      setScrollZ(handleRef.current?.getLevelScrollZ() ?? 0);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const slotColor = useMemo(() => {
    const colors: Record<string, string> = {};
    assignedSlots.forEach((id, i) => {
      colors[id] = SLOT_COLORS[i % SLOT_COLORS.length];
    });
    return colors;
  }, [assignedSlots]);

  const terrainSlots = useMemo(() => assignedSlots.filter(isTerrainSlot), [assignedSlots]);
  const objectSlots = useMemo(() => assignedSlots.filter(isObjectSlot), [assignedSlots]);
  const paletteSlots = mode === "terrain" ? terrainSlots : mode === "object" ? objectSlots : [];
  const totalDepth = level.rows * level.cellSize;
  const progressRow = Math.min(level.rows - 1, Math.floor(scrollZ / level.cellSize));
  const currentGridRow = level.rows - 1 - progressRow;
  const progressPct = totalDepth > 0 ? (scrollZ / totalDepth) * 100 : 0;
  const rows = useMemo(() => Array.from({ length: level.rows }, (_, i) => i), [level.rows]);
  const cols = useMemo(() => Array.from({ length: level.columns }, (_, i) => i), [level.columns]);
  const selectedLabel = labelForSelection(mode, selectedTerrain, selectedObject, selectedHeight);

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

  return (
    <div className="lb-page">
      <canvas ref={canvasRef} className="lb-bg-canvas" />
      <div className="lb-preview-shade" />

      <aside className="lb-panel lb-panel-left">
        <HeaderPanel level={level} filled={countPaintedCells(level)} saved={saved} />
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
          onScrub={scrubTo}
        />
        <GridPanel
          mode={mode}
          level={level}
          rows={rows}
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

function HeaderPanel({ level, filled, saved }: { level: Level; filled: number; saved: boolean }) {
  return (
    <header className="lb-sidebar-head">
      <h1>Level Builder</h1>
      <p className="dim">
        {level.columns}×{level.rows} grid · {level.cellSize.toFixed(1)}wu/cell ·{" "}
        {filled}/{level.columns * level.rows} filled · {saved ? "✓" : "saving…"}
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
        <p className="dim">No matching assigned slots yet. Go to <b>3D Models</b> first.</p>
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
                  if (isTerrainSlot(id)) {
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
                {id}
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
  onScrub,
}: {
  paused: boolean;
  progressPct: number;
  progressRow: number;
  level: Level;
  totalDepth: number;
  scrollZ: number;
  onPausedChange: (paused: boolean) => void;
  onScrub: (z: number) => void;
}) {
  const elapsedSeconds = scrollZ / SCROLL;
  const levelSeconds = totalDepth / SCROLL;
  return (
    <section className="lb-section lb-preview-section">
      <h2>Preview</h2>
      <div className="lb-preview-bar">
        <button className={paused ? "" : "on"} onClick={() => onPausedChange(!paused)}>
          {paused ? "Play" : "Pause"}
        </button>
        <span className="dim lb-row-label">{Math.round(progressPct)}%</span>
      </div>
      <input
        type="range"
        className="lb-scroll-slider"
        min={0}
        max={totalDepth}
        step={level.cellSize}
        value={scrollZ}
        onInput={(e) => onScrub(Number(e.currentTarget.value))}
        onChange={(e) => onScrub(Number(e.currentTarget.value))}
      />
      <div className="lb-preview-readout">
        <span><b>Row</b> {progressRow + 1}/{level.rows}</span>
        <span><b>Distance</b> {Math.round(scrollZ)}/{Math.round(totalDepth)}wu</span>
        <span><b>Time</b> {elapsedSeconds.toFixed(1)}/{levelSeconds.toFixed(1)}s</span>
      </div>
    </section>
  );
}

function GridPanel({
  mode,
  level,
  rows,
  cols,
  currentGridRow,
  slotColor,
  pointerDown,
  onPaintCell,
}: {
  mode: PaintMode;
  level: Level;
  rows: number[];
  cols: number[];
  currentGridRow: number;
  slotColor: Record<string, string>;
  pointerDown: MutableRefObject<boolean>;
  onPaintCell: (col: number, row: number) => void;
}) {
  return (
    <section className="lb-section lb-grid-section">
      <div className="lb-grid-title">
        <h2>Grid</h2>
        <span className="dim">{level.columns} columns · {level.rows} rows</span>
      </div>
      <div className="lb-grid-wrap">
        <div
          className="lb-grid"
          style={{
            gridTemplateColumns: `var(--lb-row-gutter) repeat(${level.columns}, minmax(0, 1fr))`,
          }}
          onPointerUp={() => { pointerDown.current = false; }}
          onPointerLeave={() => { pointerDown.current = false; }}
        >
          {rows.map((row) => (
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

function isTerrainSlot(id: string): boolean {
  return id.startsWith("terrain-");
}

function isObjectSlot(id: string): boolean {
  return !isTerrainSlot(id);
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
