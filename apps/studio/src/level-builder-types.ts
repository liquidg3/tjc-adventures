/** Shared types for the Level Builder UI layer. */

export type PaintMode = "terrain" | "object" | "height";

export const PAINT_MODES: Array<{ id: PaintMode; label: string }> = [
  { id: "terrain", label: "Terrain" },
  { id: "object", label: "Objects" },
  { id: "height", label: "Height" },
];
