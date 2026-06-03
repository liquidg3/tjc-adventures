import { useEffect, useMemo, useRef, useState } from "react";
import {
  createShipScene,
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
  emptyLevel,
  MAX_HEIGHT,
  mergeLevel,
} from "./level-builder-state";
import { SLOTS } from "./slots";
import { usePersistedJson } from "./use-persisted-json";

const LEVEL_URL = "/__level-builder";
const ASSET_MAP_URL = "/__asset-map";

type Tool = "prop" | "height" | "erase";

const HEIGHT_LEVELS = Array.from({ length: MAX_HEIGHT + 1 }, (_, i) => i);

const PROP_COLORS = [
  "#7fc97f", "#beaed4", "#fdc086", "#ffff99", "#386cb0",
  "#f0027f", "#bf5b17", "#666666", "#a6cee3", "#fb9a99",
];


export function LevelBuilder() {
  const { value: level, setValue: setLevel, saved, loaded } = usePersistedJson(
    LEVEL_URL,
    emptyLevel(),
    mergeLevel,
  );
  const [tool, setTool] = useState<Tool>("prop");
  const [selectedProp, setSelectedProp] = useState<string>("");
  const [selectedHeight, setSelectedHeight] = useState<number>(1);
  const [assignedSlots, setAssignedSlots] = useState<string[]>([]);
  const [assetUrlMap, setAssetUrlMap] = useState<Record<string, string>>({});
  const [paused, setPaused] = useState(false);
  const [scrollZ, setScrollZ] = useState(0);
  const pointerDown = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<SceneHandle | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    fetch(ASSET_MAP_URL)
      .then((r) => r.json())
      .then((data) => {
        const assignments = parseAssetAssignments(data);
        const eligible = SLOTS.flatMap((c) => c.slots)
          .map((s) => s.id)
          .filter((id) => getAssignedModelValue(assignments[id]) && !id.startsWith("ship-"));
        setAssignedSlots(eligible);
        setSelectedProp((current) => current || eligible[0] || "");
        const urlMap: Record<string, string> = {};
        for (const id of eligible) {
          const url = assetValueToUrl(getAssignedModelValue(assignments[id]));
          if (url) urlMap[id] = url;
        }
        setAssetUrlMap(urlMap);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const handle = createShipScene(canvasRef.current);
    handleRef.current = handle;
    handle.setLevelScrollPaused(false);
    return () => {
      handle.dispose();
      handleRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!loaded || !handleRef.current) return;
    handleRef.current.setLevelCells(
      level.cells as LevelGridCell[],
      level.width,
      level.depth,
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
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); };
  }, []);

  const propColor = useMemo(() => {
    const map: Record<string, string> = {};
    assignedSlots.forEach((id, i) => { map[id] = PROP_COLORS[i % PROP_COLORS.length]; });
    return map;
  }, [assignedSlots]);

  const paintCell = (col: number, row: number) => {
    const i = cellIndex(level, col, row);
    if (i < 0) return;
    const cur = level.cells[i] ?? {};
    let nextCell = cur;
    if (tool === "prop" && selectedProp) {
      if (cur.prop === selectedProp) return;
      nextCell = { ...cur, prop: selectedProp };
    } else if (tool === "height") {
      if (cur.height === selectedHeight) return;
      nextCell = { ...cur, height: selectedHeight };
    } else if (tool === "erase") {
      if (!cur.prop && !cur.height) return;
      nextCell = {};
    } else return;
    const cells = [...level.cells];
    cells[i] = nextCell;
    setLevel({ ...level, cells });
  };

  const resetLevel = () => {
    if (!window.confirm("Clear every cell in this level?")) return;
    setLevel(emptyLevel(level.width, level.depth, level.cellSize));
  };

  const totalDepth = level.depth * level.cellSize;
  const currentRow = Math.min(level.depth - 1, Math.floor(scrollZ / level.cellSize));
  const rows = Array.from({ length: level.depth }, (_, i) => i);
  const cols = Array.from({ length: level.width }, (_, i) => i);
  const filled = level.cells.filter((c) => c.prop || c.height).length;

  return (
    <div className="lb-page">
      {/* Right: live 3D scene */}
      <canvas ref={canvasRef} className="lb-bg-canvas" />

      {/* Left: controls sidebar */}
      <div className="lb-sidebar">
        <div className="lb-sidebar-head">
          <h1>Level Builder</h1>
          <p className="dim">
            {level.width}×{level.depth} grid · {level.cellSize}wu/cell ·{" "}
            {filled}/{level.cells.length} filled · {saved ? "✓" : "saving…"}
          </p>
        </div>

        {/* Tool selector */}
        <div className="lb-toolbar">
          <div className="lb-tool-group">
            <span className="lb-tool-label">Tool</span>
            <button className={tool === "prop" ? "on" : ""} onClick={() => setTool("prop")}>Prop</button>
            <button className={tool === "height" ? "on" : ""} onClick={() => setTool("height")}>Height</button>
            <button className={tool === "erase" ? "on" : ""} onClick={() => setTool("erase")}>Erase</button>
          </div>
          {tool === "height" && (
            <div className="lb-tool-group">
              <span className="lb-tool-label">Level</span>
              {HEIGHT_LEVELS.map((h) => (
                <button key={h} className={selectedHeight === h ? "on" : ""} onClick={() => setSelectedHeight(h)}>{h}</button>
              ))}
            </div>
          )}
          <button className="lb-reset" onClick={resetLevel}>Clear</button>
        </div>

        {/* Preview controls */}
        <div className="lb-preview-bar">
          <button className={paused ? "" : "on"} onClick={() => setPaused((p) => !p)}>
            {paused ? "▶" : "⏸"}
          </button>
          <input
            type="range"
            className="lb-scroll-slider"
            min={0}
            max={totalDepth}
            step={level.cellSize}
            value={scrollZ}
            onChange={(e) => handleRef.current?.setLevelScrollZ(Number(e.target.value))}
          />
          <span className="dim lb-row-label">row {currentRow + 1}/{level.depth}</span>
        </div>

        {/* Grid */}
        <div className="lb-grid-wrap">
          <div
            className="lb-grid"
            style={{
              gridTemplateColumns: `repeat(${level.width}, 1.2rem)`,
              gridTemplateRows: `repeat(${level.depth}, 1.2rem)`,
            }}
            onPointerUp={() => { pointerDown.current = false; }}
            onPointerLeave={() => { pointerDown.current = false; }}
          >
            {rows.map((row) =>
              cols.map((col) => {
                const i = cellIndex(level, col, row);
                const cell = level.cells[i] ?? {};
                const propBg = cell.prop ? propColor[cell.prop] ?? "#888" : undefined;
                const heightAlpha = cell.height ? 0.12 + cell.height * 0.18 : 0;
                const bg = propBg ?? `rgba(255,255,255,${heightAlpha})`;
                return (
                  <button
                    key={`${col}-${row}`}
                    className={`lb-cell${row === currentRow ? " lb-cell-current-row" : ""}`}
                    type="button"
                    style={{ background: bg }}
                    title={`[${col},${row}]${cell.prop ? " · " + cell.prop : ""}${cell.height ? " · h=" + cell.height : ""}`}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      pointerDown.current = true;
                      paintCell(col, row);
                    }}
                    onPointerEnter={() => { if (pointerDown.current) paintCell(col, row); }}
                  />
                );
              }),
            )}
          </div>
        </div>

        {/* Palette */}
        <aside className="lb-palette">
          <h3>Palette</h3>
          {!loaded && <p className="dim">Loading…</p>}
          {loaded && assignedSlots.length === 0 && (
            <p className="dim">No env/prop/terrain slots assigned yet — go to <b>3D Models</b> first.</p>
          )}
          {assignedSlots.map((id) => (
            <button
              key={id}
              className={`lb-palette-item ${selectedProp === id ? "on" : ""}`}
              onClick={() => { setTool("prop"); setSelectedProp(id); }}
              title={id}
            >
              <span className="lb-swatch" style={{ background: propColor[id] }} />
              {id}
            </button>
          ))}
        </aside>
      </div>
    </div>
  );
}
