/**
 * Vertical Shooter Level Builder data model.
 *
 * v2 separates terrain, height, and object placement. Storage remains row-major:
 * row 0 = far end of the run, last row = start/near edge.
 */

import type { TerrainShape } from "./model-catalog";

export type { TerrainShape };

export type TerrainFeatureFamily = "river" | "path" | "road";
export type TerrainRotation = 0 | 90 | 180 | 270;

export interface TerrainFeatureCell {
  family: TerrainFeatureFamily;
  shape: TerrainShape;
  rotation: TerrainRotation;
  /** Resolved catalog model value, e.g. "model:kenney-nature-kit/ground_riverCorner". */
  modelId: string;
  /** When true, the connectivity resolver leaves this cell alone. */
  manual?: boolean;
  /** When true, the resolved model is a fallback (exact shape was missing in the catalog). */
  fallback?: boolean;
}

export interface TerrainCell {
  /** Resolved model value kept for renderer compatibility; always mirrors feature.modelId when feature is present. */
  terrain?: string;
  /** Connected-feature intent. When present, shape/rotation were computed from neighbors. */
  feature?: TerrainFeatureCell;
  /** Manual rotation applied to a non-feature terrain tile. Cycles 0→90→180→270 on same-model click. */
  rotation?: TerrainRotation;
}

export interface HeightCell {
  /** 0..MAX_HEIGHT, darker in the editor = taller. */
  height?: number;
}

export interface PlacedObject {
  /** Stable enough for diffing later; first pass derives from cell + slot. */
  id: string;
  /** Legacy asset-map slot id or catalog model value. */
  slot: string;
  offset?: [number, number];
  rotation?: number;
  scale?: number;
}

export interface ObjectCell {
  objects?: PlacedObject[];
}

export interface LevelLayers {
  terrain: TerrainCell[];
  height: HeightCell[];
  objects: ObjectCell[];
}

export interface Level {
  version: 2;
  durationSec: number;
  scrollSpeed: number;
  fieldWidth: number;
  columns: number;
  rows: number;
  cellSize: number;
  layers: LevelLayers;
}

/** Legacy shape persisted by v1 builders. */
interface LevelV1 {
  version: 1;
  width: number;
  depth: number;
  cellSize: number;
  cells: Array<{ prop?: string; height?: number }>;
}

export interface LegacyLevelGridCell {
  prop?: string;
  height?: number;
  rotation?: number;
}

export const DEFAULT_LEVEL_DURATION_SEC = 300;
export const DEFAULT_LEVEL_SCROLL_SPEED = 16;
export const DEFAULT_FIELD_WIDTH = 384;
export const DEFAULT_LEVEL_COLUMNS = 12;
export const MAX_HEIGHT = 8;

export const COLUMN_OPTIONS = [10, 12, 16, 24, 32] as const;

export function deriveCellSize(fieldWidth: number, columns: number): number {
  return fieldWidth / Math.max(1, columns);
}

export function deriveRows(durationSec: number, scrollSpeed: number, cellSize: number): number {
  return Math.ceil((durationSec * scrollSpeed) / Math.max(0.001, cellSize));
}

export function emptyLevel(opts: Partial<Pick<Level, "columns" | "durationSec" | "fieldWidth" | "scrollSpeed">> = {}): Level {
  const durationSec = saneNumber(opts.durationSec, DEFAULT_LEVEL_DURATION_SEC);
  const scrollSpeed = saneNumber(opts.scrollSpeed, DEFAULT_LEVEL_SCROLL_SPEED);
  const fieldWidth = saneNumber(opts.fieldWidth, DEFAULT_FIELD_WIDTH);
  const columns = Math.max(1, Math.round(saneNumber(opts.columns, DEFAULT_LEVEL_COLUMNS)));
  const cellSize = deriveCellSize(fieldWidth, columns);
  const rows = deriveRows(durationSec, scrollSpeed, cellSize);
  return {
    version: 2,
    durationSec,
    scrollSpeed,
    fieldWidth,
    columns,
    rows,
    cellSize,
    layers: emptyLayers(columns * rows),
  };
}

export function cellIndex(level: Level, col: number, row: number): number {
  if (col < 0 || col >= level.columns || row < 0 || row >= level.rows) return -1;
  return row * level.columns + col;
}

export function mergeLevel(raw: unknown): Level {
  if (!raw || typeof raw !== "object") return emptyLevel();
  const obj = raw as Record<string, unknown>;
  if (obj.version === 1 || Array.isArray(obj.cells)) return migrateV1(obj as unknown as Partial<LevelV1>);
  return mergeV2(obj);
}

export function projectObjectsToLegacyCells(level: Level): LegacyLevelGridCell[] {
  const count = level.columns * level.rows;
  return Array.from({ length: count }, (_, i) => {
    const obj = level.layers.objects[i]?.objects?.[0];
    const height = level.layers.height[i]?.height;
    const cell: LegacyLevelGridCell = {};
    if (obj?.slot) cell.prop = obj.slot;
    if (typeof height === "number" && height > 0) cell.height = height;
    if (typeof obj?.rotation === "number" && obj.rotation !== 0) cell.rotation = obj.rotation;
    return cell;
  });
}

export function countPaintedCells(level: Level): number {
  const count = level.columns * level.rows;
  let filled = 0;
  for (let i = 0; i < count; i++) {
    if (
      level.layers.terrain[i]?.terrain ||
      level.layers.terrain[i]?.feature ||
      level.layers.height[i]?.height ||
      level.layers.objects[i]?.objects?.length
    ) filled++;
  }
  return filled;
}

export function makePlacementId(col: number, row: number, slot: string): string {
  return `${row}:${col}:${slot}`;
}

function mergeV2(obj: Record<string, unknown>): Level {
  const durationSec = saneNumber(obj.durationSec, DEFAULT_LEVEL_DURATION_SEC);
  const scrollSpeed = saneNumber(obj.scrollSpeed, DEFAULT_LEVEL_SCROLL_SPEED);
  const fieldWidth = migrateFieldWidth(saneNumber(obj.fieldWidth, DEFAULT_FIELD_WIDTH));
  const columns = Math.max(1, Math.round(saneNumber(obj.columns, DEFAULT_LEVEL_COLUMNS)));
  const cellSize = deriveCellSize(fieldWidth, columns);
  const rows = deriveRows(durationSec, scrollSpeed, cellSize);
  const expected = columns * rows;
  const rawLayers = obj.layers && typeof obj.layers === "object"
    ? obj.layers as Partial<Record<keyof LevelLayers, unknown>>
    : {};
  return {
    version: 2,
    durationSec,
    scrollSpeed,
    fieldWidth,
    columns,
    rows,
    cellSize,
    layers: {
      terrain: mergeTerrainLayer(rawLayers.terrain, expected),
      height: mergeHeightLayer(rawLayers.height, expected),
      objects: mergeObjectLayer(rawLayers.objects, expected),
    },
  };
}

function migrateFieldWidth(fieldWidth: number): number {
  // Early terrain-preview passes used bad field widths:
  // - 120wu: too narrow, a center runway that did not reach the visible edges.
  // - 1200wu: too wide, only a fraction of the selected columns fit on screen.
  // 384wu fits the current Level Builder camera so all 32 columns are visible
  // across the far/top edge of the preview.
  return fieldWidth < 300 || fieldWidth > 600 ? DEFAULT_FIELD_WIDTH : fieldWidth;
}

function migrateV1(raw: Partial<LevelV1>): Level {
  const base = emptyLevel();
  const oldWidth = Math.max(1, Math.round(saneNumber(raw.width, DEFAULT_LEVEL_COLUMNS)));
  const oldDepth = Math.max(1, Math.round(saneNumber(raw.depth, 80)));
  const oldCells = Array.isArray(raw.cells) ? raw.cells : [];

  for (let oldRow = 0; oldRow < oldDepth; oldRow++) {
    for (let oldCol = 0; oldCol < oldWidth; oldCol++) {
      const oldCell = oldCells[oldRow * oldWidth + oldCol];
      if (!oldCell || typeof oldCell !== "object") continue;
      const newCol = Math.min(base.columns - 1, Math.floor((oldCol / oldWidth) * base.columns));
      const newRow = Math.min(base.rows - 1, Math.floor((oldRow / oldDepth) * base.rows));
      const i = cellIndex(base, newCol, newRow);
      if (i < 0) continue;
      if (typeof oldCell.prop === "string" && oldCell.prop) {
        base.layers.objects[i] = {
          objects: [{ id: makePlacementId(newCol, newRow, oldCell.prop), slot: oldCell.prop }],
        };
      }
      if (typeof oldCell.height === "number" && Number.isFinite(oldCell.height)) {
        base.layers.height[i] = { height: clamp(Math.round(oldCell.height), 0, MAX_HEIGHT) };
      }
    }
  }

  return base;
}

function emptyLayers(count: number): LevelLayers {
  return {
    terrain: Array.from({ length: count }, () => ({})),
    height: Array.from({ length: count }, () => ({})),
    objects: Array.from({ length: count }, () => ({})),
  };
}

function mergeTerrainLayer(raw: unknown, count: number): TerrainCell[] {
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from({ length: count }, (_, i) => {
    const cell = arr[i];
    if (!cell || typeof cell !== "object") return {};
    const c = cell as TerrainCell;
    const feature = parseFeatureCell(c.feature);
    if (feature) {
      // Feature-backed cell: terrain always mirrors the resolved modelId.
      return { terrain: feature.modelId, feature };
    }
    const terrain = typeof c.terrain === "string" && c.terrain ? c.terrain : undefined;
    if (!terrain) return {};
    const rotation = isTerrainRotation(c.rotation) ? c.rotation : undefined;
    return rotation !== undefined ? { terrain, rotation } : { terrain };
  });
}

function parseFeatureCell(raw: unknown): TerrainFeatureCell | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const f = raw as Partial<TerrainFeatureCell>;
  if (!isTerrainFeatureFamily(f.family)) return undefined;
  if (!isTerrainShape(f.shape)) return undefined;
  if (!isTerrainRotation(f.rotation)) return undefined;
  // Reject empty modelId: unresolved placeholders are transient and should not
  // survive a save/load cycle. They get dropped here and the cell reloads clean.
  if (typeof f.modelId !== "string" || !f.modelId) return undefined;
  return {
    family: f.family,
    shape: f.shape,
    rotation: f.rotation,
    modelId: f.modelId,
    ...(f.manual === true ? { manual: true } : {}),
    ...(f.fallback === true ? { fallback: true } : {}),
  };
}

function isTerrainFeatureFamily(v: unknown): v is TerrainFeatureFamily {
  return v === "river" || v === "path" || v === "road";
}

function isTerrainShape(v: unknown): v is TerrainShape {
  return typeof v === "string" &&
    ["straight", "corner", "end", "split", "cross", "tile"].includes(v);
}

function isTerrainRotation(v: unknown): v is TerrainRotation {
  return v === 0 || v === 90 || v === 180 || v === 270;
}

function mergeHeightLayer(raw: unknown, count: number): HeightCell[] {
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from({ length: count }, (_, i) => {
    const cell = arr[i];
    if (!cell || typeof cell !== "object") return {};
    const height = (cell as HeightCell).height;
    return typeof height === "number" && Number.isFinite(height)
      ? { height: clamp(Math.round(height), 0, MAX_HEIGHT) }
      : {};
  });
}

function mergeObjectLayer(raw: unknown, count: number): ObjectCell[] {
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from({ length: count }, (_, i) => {
    const cell = arr[i];
    if (!cell || typeof cell !== "object") return {};
    const objects = Array.isArray((cell as ObjectCell).objects)
      ? (cell as ObjectCell).objects ?? []
      : [];
    const next = objects
      .map((obj) => sanitizeObject(obj))
      .filter((obj): obj is PlacedObject => Boolean(obj));
    return next.length ? { objects: next } : {};
  });
}

function sanitizeObject(raw: unknown): PlacedObject | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Partial<PlacedObject>;
  if (typeof obj.slot !== "string" || !obj.slot) return null;
  return {
    id: typeof obj.id === "string" && obj.id ? obj.id : obj.slot,
    slot: obj.slot,
    offset: tuple2(obj.offset),
    rotation: typeof obj.rotation === "number" && Number.isFinite(obj.rotation) ? obj.rotation : undefined,
    scale: typeof obj.scale === "number" && Number.isFinite(obj.scale) ? obj.scale : undefined,
  };
}

function tuple2(raw: unknown): [number, number] | undefined {
  if (!Array.isArray(raw) || raw.length !== 2) return undefined;
  const x = saneNumber(raw[0], 0);
  const z = saneNumber(raw[1], 0);
  return [x, z];
}

function saneNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
