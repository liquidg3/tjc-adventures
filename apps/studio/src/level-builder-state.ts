/**
 * Vertical Shooter Level Builder data model.
 *
 * A level is a fixed-dimension grid of cells, each carrying optional prop +
 * height data. The grid is authored top-down in the Studio and persisted as
 * JSON via the /__level-builder dev endpoint. Cells are row-major, indexed by
 * (col, row) where row 0 = far end of the zone (top of screen) and the last
 * row = near edge (bottom of screen).
 *
 * Cell-to-world mapping at runtime (when the scene reads this later):
 *   world X = (col - width/2) * cellSize
 *   world Z (offset from a zone's start) = (depth - row) * cellSize
 *   world Y = height-nudge (cell.height ?? 0) scaled by some max-altitude const
 */

export interface LevelCell {
  /** Asset-map slot id (e.g. "env-trees", "prop-cage"); empty = no prop. */
  prop?: string;
  /** 0..3, optional. Higher = taller ground swell at this cell. */
  height?: number;
}

export interface Level {
  version: 1;
  width: number; // columns across the field
  depth: number; // rows along the scroll direction
  cellSize: number; // world units per cell side
  cells: LevelCell[]; // length === width * depth, row-major
}

export const DEFAULT_LEVEL_WIDTH = 24;
export const DEFAULT_LEVEL_DEPTH = 80;
export const DEFAULT_LEVEL_CELL_SIZE = 5;
export const MAX_HEIGHT = 3;

export function emptyLevel(
  width = DEFAULT_LEVEL_WIDTH,
  depth = DEFAULT_LEVEL_DEPTH,
  cellSize = DEFAULT_LEVEL_CELL_SIZE,
): Level {
  return {
    version: 1,
    width,
    depth,
    cellSize,
    cells: Array.from({ length: width * depth }, () => ({})),
  };
}

export function cellIndex(level: Level, col: number, row: number): number {
  if (col < 0 || col >= level.width || row < 0 || row >= level.depth) return -1;
  return row * level.width + col;
}

/**
 * Validate + merge persisted JSON into a Level. Tolerates malformed/missing
 * fields by falling back to defaults, so a corrupted file doesn't brick the
 * editor.
 */
export function mergeLevel(raw: unknown): Level {
  if (!raw || typeof raw !== "object") return emptyLevel();
  const obj = raw as Partial<Level>;
  const width = num(obj.width, DEFAULT_LEVEL_WIDTH);
  const depth = num(obj.depth, DEFAULT_LEVEL_DEPTH);
  const cellSize = num(obj.cellSize, DEFAULT_LEVEL_CELL_SIZE);
  const expected = width * depth;
  const rawCells = Array.isArray(obj.cells) ? obj.cells : [];
  const cells: LevelCell[] = Array.from({ length: expected }, (_, i) => {
    const c = rawCells[i];
    if (!c || typeof c !== "object") return {};
    const co = c as LevelCell;
    const cell: LevelCell = {};
    if (typeof co.prop === "string" && co.prop) cell.prop = co.prop;
    if (typeof co.height === "number" && Number.isFinite(co.height)) {
      cell.height = clamp(Math.round(co.height), 0, MAX_HEIGHT);
    }
    return cell;
  });
  return { version: 1, width, depth, cellSize, cells };
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
