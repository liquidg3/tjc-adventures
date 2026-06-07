import { Fragment, memo, useLayoutEffect, useRef, useState } from "react";
import { MAX_HEIGHT } from "./level-builder-state";
import type { TerrainCell, Level } from "./level-builder-state";
import type { PaintMode } from "./level-builder-types";

// Row height must match --lb-cell-h in styles.css.
const VIRTUAL_ROW_H = 20;
const VIRTUAL_OVERSCAN = 4;

// ─── GridPanel ────────────────────────────────────────────────────────────────

export function GridPanel({
  mode,
  level,
  cols,
  currentGridRow,
  slotColor,
  rectPreview,
  onCellDown,
  onCellEnter,
  onCellRightDown,
  onGridUp,
  onGridLeave,
}: {
  mode: PaintMode;
  level: Level;
  cols: number[];
  currentGridRow: number;
  slotColor: Record<string, string>;
  rectPreview: { minCol: number; maxCol: number; minRow: number; maxRow: number } | null;
  onCellDown: (col: number, row: number) => void;
  onCellEnter: (col: number, row: number) => void;
  onCellRightDown: (col: number, row: number) => void;
  onGridUp: () => void;
  onGridLeave: () => void;
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
      const last = Math.min(
        level.rows,
        Math.ceil((el.scrollTop + el.clientHeight) / VIRTUAL_ROW_H) + VIRTUAL_OVERSCAN,
      );
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
            style={{ position: "absolute", top: offsetTop, left: 0, right: 0, gridTemplateColumns: templateCols }}
            onPointerUp={onGridUp}
            onPointerLeave={onGridLeave}
          >
            {Array.from({ length: lastRow - firstRow }, (_, i) => firstRow + i).map((row) => (
              <Fragment key={`row-${row}`}>
                <div className={`lb-row-gutter${row === currentGridRow ? " lb-row-gutter-current" : ""}`}>
                  {row === currentGridRow ? "▲" : level.rows - row}
                </div>
                {cols.map((col) => {
                  const i = row * level.columns + col;
                  const terrainCell = level.layers.terrain[i];
                  const terrain = terrainCell?.terrain;
                  const object = level.layers.objects[i]?.objects?.[0]?.slot;
                  const height = level.layers.height[i]?.height ?? 0;
                  const featureClass = terrainCell?.feature
                    ? (terrainCell.feature.fallback ? "fallback" : "feature")
                    : "";
                  return (
                    <GridCell
                      key={`${col}-${row}`}
                      col={col}
                      row={row}
                      mode={mode}
                      terrain={terrain}
                      object={object}
                      height={height}
                      featureClass={featureClass}
                      title={buildCellTitle(col, row, terrainCell, object, height)}
                      current={row === currentGridRow}
                      slotColor={slotColor}
                      inRectPreview={
                        rectPreview != null &&
                        col >= rectPreview.minCol && col <= rectPreview.maxCol &&
                        row >= rectPreview.minRow && row <= rectPreview.maxRow
                      }
                      onCellDown={onCellDown}
                      onCellEnter={onCellEnter}
                      onCellRightDown={onCellRightDown}
                    />
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── GridCell ─────────────────────────────────────────────────────────────────

const GridCell = memo(function GridCell({
  col,
  row,
  mode,
  terrain,
  object,
  height,
  featureClass,
  title,
  current,
  slotColor,
  inRectPreview,
  onCellDown,
  onCellEnter,
  onCellRightDown,
}: {
  col: number;
  row: number;
  mode: PaintMode;
  terrain: string | undefined;
  object: string | undefined;
  height: number;
  featureClass: "" | "feature" | "fallback";
  title: string;
  current: boolean;
  slotColor: Record<string, string>;
  inRectPreview: boolean;
  onCellDown: (col: number, row: number) => void;
  onCellEnter: (col: number, row: number) => void;
  onCellRightDown: (col: number, row: number) => void;
}) {
  const background = cellBackground(mode, terrain, object, height, slotColor);

  let cls = `lb-cell lb-cell-${mode}`;
  if (current) cls += " lb-cell-current-row";
  if (inRectPreview) cls += " lb-cell-rect-preview";
  else if (featureClass) cls += featureClass === "fallback" ? " lb-cell-feature-fallback" : " lb-cell-feature";

  return (
    <button
      className={cls}
      type="button"
      style={{ background }}
      title={title}
      onPointerDown={(e) => {
        if (e.button === 2) { e.preventDefault(); onCellRightDown(col, row); return; }
        if (e.button !== 0) return;
        e.preventDefault();
        onCellDown(col, row);
      }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerEnter={() => onCellEnter(col, row)}
    >
      {mode === "object" && object && <span className="lb-object-dot" />}
      {mode === "terrain" && object && <span className="lb-object-ghost" />}
    </button>
  );
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cellBackground(
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

function buildCellTitle(
  col: number,
  row: number,
  cell: TerrainCell | undefined,
  object: string | undefined,
  height: number,
): string {
  const parts = [`[${col},${row}]`];
  if (cell?.feature) {
    const f = cell.feature;
    parts.push(`${f.family} ${f.shape} ${f.rotation}°${f.manual ? " [manual]" : ""}`);
  } else if (cell?.terrain) {
    parts.push(`terrain=${cell.terrain}`);
  }
  if (object) parts.push(`object=${object}`);
  if (height) parts.push(`h=${height}`);
  return parts.join(" · ");
}
