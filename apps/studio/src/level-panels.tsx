import { useRef, type PointerEvent } from "react";
import { SCROLL, type PerfMetricSnapshot } from "@tjc/scenes";
import { COLUMN_OPTIONS, type Level } from "./level-builder-state";
import { PAINT_MODES, type PaintMode } from "./level-builder-types";

// ─── LevelPanel ──────────────────────────────────────────────────────────────

export function LevelPanel({
  level,
  saved,
  fps,
  perfMetrics,
  onColumnsChange,
}: {
  level: Level;
  saved: boolean;
  fps: number;
  perfMetrics: PerfMetricSnapshot;
  onColumnsChange: (columns: number) => void;
}) {
  const perfRows = topPerfRows(perfMetrics);
  return (
    <section className="lb-section lb-level-panel">
      <div className="lb-level-meta">
        <span className="lb-level-title">Level Builder</span>
        <span className="dim">{saved ? "✓" : "saving…"}</span>
        <b className={`lb-fps ${fps < 30 ? "lb-fps-bad" : fps < 50 ? "lb-fps-warn" : "lb-fps-good"}`}>{fps} fps</b>
      </div>
      <div className="lb-settings-grid">
        <label>
          <span>Columns</span>
          <select value={level.columns} onChange={(e) => onColumnsChange(Number(e.target.value))}>
            {COLUMN_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <Readout label="Cell" value={`${level.cellSize.toFixed(0)}wu`} />
      </div>
      {perfRows.length > 0 && (
        <div className="lb-perf-readout" title={perfTitle(perfMetrics)}>
          {perfRows.map((row) => (
            <span key={row.name}>
              <b>{row.label}</b>
              {row.value}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── ColumnChangeConfirm ─────────────────────────────────────────────────────

export function ColumnChangeConfirm({
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

// ─── PaintPanel ──────────────────────────────────────────────────────────────

export function PaintPanel({
  mode,
  brushShape,
  pendingClear,
  onModeChange,
  onBrushShapeChange,
  onRequestClear,
  onCancelClear,
  onConfirmClear,
}: {
  mode: PaintMode;
  brushShape: "free" | "rect";
  pendingClear: boolean;
  onModeChange: (mode: PaintMode) => void;
  onBrushShapeChange: (shape: "free" | "rect") => void;
  onRequestClear: () => void;
  onCancelClear: () => void;
  onConfirmClear: () => void;
}) {
  return (
    <section className="lb-section lb-paint-panel">
      <div className="lb-paint-row">
        <select value={mode} onChange={(e) => onModeChange(e.target.value as PaintMode)}>
          {PAINT_MODES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <select
          value={brushShape}
          onChange={(e) => onBrushShapeChange(e.target.value as "free" | "rect")}
          title="Free = paint while dragging · Rect = drag to fill rectangle"
        >
          <option value="free">Free</option>
          <option value="rect">Rect</option>
        </select>
        <button className="lb-reset btn-sm" onClick={onRequestClear}>Clear</button>
      </div>
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

// ─── PreviewPanel ─────────────────────────────────────────────────────────────

export function PreviewPanel({
  paused,
  progressPct,
  totalDepth,
  scrollZ,
  terrainRenderRowsBack,
  terrainRenderRowsForward,
  onPausedChange,
  onScrubStart,
  onScrub,
  onScrubEnd,
  onTerrainRenderRowsBackChange,
  onTerrainRenderRowsForwardChange,
}: {
  paused: boolean;
  progressPct: number;
  totalDepth: number;
  scrollZ: number;
  terrainRenderRowsBack: number;
  terrainRenderRowsForward: number;
  onPausedChange: (paused: boolean) => void;
  onScrubStart: () => void;
  onScrub: (z: number) => void;
  onScrubEnd: () => void;
  onTerrainRenderRowsBackChange: (rows: number) => void;
  onTerrainRenderRowsForwardChange: (rows: number) => void;
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

  function readRows(value: string) {
    const rows = Number(value);
    if (!Number.isFinite(rows)) return 0;
    return Math.max(0, Math.min(96, Math.round(rows)));
  }

  return (
    <section className="lb-section lb-preview-section">
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
        <span><b>Time</b> {elapsedSeconds.toFixed(1)}/{levelSeconds.toFixed(1)}s</span>
      </div>
      <div className="lb-terrain-window">
        <label>
          <span>Back Rows</span>
          <input
            type="range"
            min="0"
            max="96"
            value={terrainRenderRowsBack}
            onChange={(e) => onTerrainRenderRowsBackChange(readRows(e.target.value))}
          />
          <input
            type="number"
            min="0"
            max="96"
            value={terrainRenderRowsBack}
            onChange={(e) => onTerrainRenderRowsBackChange(readRows(e.target.value))}
          />
        </label>
        <label>
          <span>Forward Rows</span>
          <input
            type="range"
            min="0"
            max="96"
            value={terrainRenderRowsForward}
            onChange={(e) => onTerrainRenderRowsForwardChange(readRows(e.target.value))}
          />
          <input
            type="number"
            min="0"
            max="96"
            value={terrainRenderRowsForward}
            onChange={(e) => onTerrainRenderRowsForwardChange(readRows(e.target.value))}
          />
        </label>
      </div>
    </section>
  );
}

// ─── Readout (internal to this file) ─────────────────────────────────────────

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <b>{label}</b>
      <span>{value}</span>
    </div>
  );
}

function topPerfRows(metrics: PerfMetricSnapshot): Array<{ name: string; label: string; value: string }> {
  return Object.entries(metrics)
    .filter(([name, bucket]) =>
      !name.startsWith("stats.") &&
      !name.endsWith("changedCells") &&
      bucket.count > 0 &&
      bucket.max >= 0.05,
    )
    .sort((a, b) => b[1].max - a[1].max)
    .slice(0, 4)
    .map(([name, bucket]) => ({
      name,
      label: shortMetricName(name),
      value: `${bucket.avg.toFixed(1)} / ${bucket.max.toFixed(1)}ms`,
    }));
}

function perfTitle(metrics: PerfMetricSnapshot): string {
  return Object.entries(metrics)
    .sort((a, b) => b[1].max - a[1].max)
    .map(([name, b]) => `${name}: avg ${b.avg.toFixed(2)}ms, max ${b.max.toFixed(2)}ms, n=${b.count}`)
    .join("\n");
}

function shortMetricName(name: string): string {
  return name
    .replace(/^frame\./, "")
    .replace(/^terrain\./, "terr.")
    .replace(/^props\./, "prop.")
    .replace(/^api\./, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
}
