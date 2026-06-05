import type { TerrainShape } from "./model-catalog";
import type { TerrainCell, TerrainFeatureFamily, TerrainRotation } from "./level-builder-state";

export const TERRAIN_N = 1;
export const TERRAIN_E = 2;
export const TERRAIN_S = 4;
export const TERRAIN_W = 8;

/**
 * Computes the 4-bit N/E/S/W neighbor mask for a cell within a flat row-major
 * terrain array. A neighbor contributes a bit when its feature.family matches
 * the given family — manual cells of the same family still count as connected.
 */
export function terrainMaskForCell(
  cells: TerrainCell[],
  columns: number,
  rows: number,
  col: number,
  row: number,
  family: TerrainFeatureFamily,
): number {
  let mask = 0;
  if (hasFamilyAt(cells, columns, rows, col, row - 1, family)) mask |= TERRAIN_N;
  if (hasFamilyAt(cells, columns, rows, col + 1, row,     family)) mask |= TERRAIN_E;
  if (hasFamilyAt(cells, columns, rows, col, row + 1, family)) mask |= TERRAIN_S;
  if (hasFamilyAt(cells, columns, rows, col - 1, row,     family)) mask |= TERRAIN_W;
  return mask;
}

function hasFamilyAt(
  cells: TerrainCell[],
  columns: number,
  rows: number,
  col: number,
  row: number,
  family: TerrainFeatureFamily,
): boolean {
  if (col < 0 || col >= columns || row < 0 || row >= rows) return false;
  return cells[row * columns + col]?.feature?.family === family;
}

/**
 * Maps a 4-bit neighbor mask to the correct terrain shape and rotation.
 *
 * ROTATION CONVENTION: values are degrees CW when viewed from above.
 * The renderer must apply `node.rotation.y = -rotDeg * (π/180)` in Babylon.js.
 *
 * VISUAL INSPECTION REQUIRED: the table assumes Kenney ground_river* models are
 * authored with a N-S straight axis at rotation 0 and a N+E corner at rotation 0.
 * Load ground_riverStraight, ground_riverCorner, ground_riverEnd, ground_riverSplit,
 * ground_riverCross in Asset Test and update the entries below if any orientation
 * differs from expectation.
 *
 * Mask bit assignment: N=1, E=2, S=4, W=8
 *
 * Mask | Binary | Open directions  | Shape    | CW°
 * -----|--------|------------------|----------|---------
 *  0   | 0000   | (none)           | tile     |   0
 *  1   | 0001   | N                | end      | 180
 *  2   | 0010   | E                | end      | 270
 *  3   | 0011   | N+E              | corner   |   0
 *  4   | 0100   | S                | end      |   0
 *  5   | 0101   | N+S              | straight |   0
 *  6   | 0110   | E+S              | corner   |  90
 *  7   | 0111   | N+E+S  (−W)      | split    |   0
 *  8   | 1000   | W                | end      |  90
 *  9   | 1001   | N+W              | corner   | 270
 * 10   | 1010   | E+W              | straight |  90
 * 11   | 1011   | N+E+W  (−S)      | split    | 270
 * 12   | 1100   | S+W              | corner   | 180
 * 13   | 1101   | N+S+W  (−E)      | split    | 180
 * 14   | 1110   | E+S+W  (−N)      | split    |  90
 * 15   | 1111   | N+E+S+W          | cross    |   0
 */
const SHAPE_TABLE: ReadonlyArray<{ shape: TerrainShape; rotation: TerrainRotation }> = [
  { shape: "tile",     rotation: 0   }, //  0: isolated
  { shape: "end",      rotation: 180 }, //  1: N
  { shape: "end",      rotation: 270 }, //  2: E
  { shape: "corner",   rotation: 0   }, //  3: N+E
  { shape: "end",      rotation: 0   }, //  4: S
  { shape: "straight", rotation: 0   }, //  5: N+S
  { shape: "corner",   rotation: 90  }, //  6: E+S
  { shape: "split",    rotation: 0   }, //  7: N+E+S (missing W)
  { shape: "end",      rotation: 90  }, //  8: W
  { shape: "corner",   rotation: 270 }, //  9: N+W
  { shape: "straight", rotation: 90  }, // 10: E+W
  { shape: "split",    rotation: 270 }, // 11: N+E+W (missing S)
  { shape: "corner",   rotation: 180 }, // 12: S+W
  { shape: "split",    rotation: 180 }, // 13: N+S+W (missing E)
  { shape: "split",    rotation: 90  }, // 14: E+S+W (missing N)
  { shape: "cross",    rotation: 0   }, // 15: all
];

export function terrainShapeForMask(mask: number): {
  shape: TerrainShape;
  rotation: TerrainRotation;
} {
  return SHAPE_TABLE[mask & 0xf] ?? { shape: "tile", rotation: 0 };
}
