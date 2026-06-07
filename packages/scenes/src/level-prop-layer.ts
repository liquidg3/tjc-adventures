import { type AbstractMesh, type Scene, type TransformNode } from "@babylonjs/core";
import { fitScale, loadModel } from "./ship-materials";
import { SCROLL } from "./scene-config";

const HEIGHT_STEP_WU = 1.25;
const DEFAULT_PLACEMENT_SCALE = { min: 4, cell: 0.75 };
const SLOT_PLACEMENT_SCALE: Record<string, { min: number; cell: number }> = {
  "env-trees": { min: 22, cell: 2.4 },
  "env-tree-2": { min: 22, cell: 2.4 },
  "env-bushes": { min: 4, cell: 0.45 },
  "env-grass": { min: 4, cell: 0.45 },
  "env-rocks": { min: 4, cell: 0.5 },
  "prop-cage": { min: 7, cell: 0.85 },
  "prop-box": { min: 7, cell: 0.85 },
  "prop-berries": { min: 2.5, cell: 0.3 },
};

export interface LevelGridCell {
  prop?: string;
  height?: number;
  rotation?: number;
}

export interface LevelPropLayerController {
  setLevelCells(
    cells: LevelGridCell[],
    width: number,
    depth: number,
    cellSize: number,
    assetUrlMap: Record<string, string>,
  ): void;
  setScrollZ(z: number): void;
  step(dt: number): void;
  getScrollZ(): number;
  getTotalDepth(): number;
  setPaused(paused: boolean): void;
  dispose(): void;
}

interface PlacedProp {
  node: TransformNode;
  baseZ: number;
}

export function createLevelPropLayer(scene: Scene): LevelPropLayerController {
  const modelCache = new Map<string, AbstractMesh | null>();
  const loadingPromises = new Map<string, Promise<void>>();
  const placed = new Map<number, PlacedProp>();
  let currentCells: LevelGridCell[] = [];
  let currentWidth = 0;
  let currentDepth = 0;
  let currentCellSize = 0;
  let currentAssetUrlMap: Record<string, string> | null = null;
  let scrollZ = 0;
  let totalDepth = 0;
  let paused = false;
  // Incremented on every setLevelCells call so stale async completions self-abort.
  let generation = 0;

  function clearPlaced() {
    for (const p of placed.values()) p.node.dispose();
    placed.clear();
  }

  function syncPositions() {
    for (const p of placed.values()) {
      const z = p.baseZ - scrollZ;
      p.node.position.z = z;
      p.node.setEnabled(z > -60 && z < 900);
    }
  }

  function disposePlacedAt(index: number) {
    placed.get(index)?.node.dispose();
    placed.delete(index);
  }

  function cellKey(cell: LevelGridCell | undefined, assetUrlMap: Record<string, string>): string {
    if (!cell?.prop) return "";
    const url = assetUrlMap[cell.prop];
    if (!url) return "";
    return `${cell.prop}|${url}|${cell.height ?? 0}|${cell.rotation ?? 0}`;
  }

  async function ensureModelsLoaded(
    cells: LevelGridCell[],
    assetUrlMap: Record<string, string>,
  ) {
    const uniqueUrls = new Set<string>();
    for (const cell of cells) {
      const url = cell.prop ? assetUrlMap[cell.prop] : undefined;
      if (url) uniqueUrls.add(url);
    }

    await Promise.all([...uniqueUrls].map((url) => {
      if (modelCache.has(url)) return;
      if (loadingPromises.has(url)) return loadingPromises.get(url);
      const p = loadModel(url, scene).then((root) => {
        modelCache.set(url, root ?? null);
        loadingPromises.delete(url);
      });
      loadingPromises.set(url, p);
      return p;
    }));
  }

  function placeCell(
    index: number,
    cell: LevelGridCell,
    width: number,
    depth: number,
    cellSize: number,
    assetUrlMap: Record<string, string>,
  ) {
    if (!cell.prop) return;
    const url = assetUrlMap[cell.prop];
    if (!url) return;
    const template = modelCache.get(url);
    if (!template) return;

    const col = index % width;
    const row = Math.floor(index / width);
    // row 0 = far end of level (largest Z — first thing you fly toward)
    const baseX = (col - width / 2 + 0.5) * cellSize;
    const baseZ = (depth - 1 - row) * cellSize + cellSize / 2;

    const inst = template.instantiateHierarchy(null);
    if (!inst) return;
    const node = inst as TransformNode;
    const meshes = node.getChildMeshes();
    const rootMesh = meshes[0];
    const targetH = targetHeightForSlot(cell.prop, cellSize);
    const s = rootMesh ? fitScale(rootMesh as AbstractMesh, targetH) : 1;
    node.scaling.setAll(s);
    // addRotation handles both rotationQuaternion (set by GLB loader) and Euler rotation.
    // Direct assignment to rotation.y is silently ignored when rotationQuaternion is active.
    if (cell.rotation) node.addRotation(0, -cell.rotation * Math.PI / 180, 0);
    node.position.set(baseX, (cell.height ?? 0) * HEIGHT_STEP_WU, baseZ - scrollZ);
    placed.set(index, { node, baseZ });
  }

  async function rebuildAll(
    cells: LevelGridCell[],
    width: number,
    depth: number,
    cellSize: number,
    assetUrlMap: Record<string, string>,
    gen: number,
  ) {
    clearPlaced();
    totalDepth = depth * cellSize;

    // Load any URL not yet cached, deduplicated via in-flight promise map so
    // concurrent calls for the same URL never trigger duplicate SceneLoader loads.
    await ensureModelsLoaded(cells, assetUrlMap);

    // Bail if a newer setLevelCells call has already taken over.
    if (gen !== generation) return;

    for (let i = 0; i < cells.length; i++) {
      if (gen !== generation) break;
      placeCell(i, cells[i], width, depth, cellSize, assetUrlMap);
    }
  }

  async function updateChanged(
    cells: LevelGridCell[],
    width: number,
    depth: number,
    cellSize: number,
    assetUrlMap: Record<string, string>,
    changed: number[],
    gen: number,
  ) {
    totalDepth = depth * cellSize;
    await ensureModelsLoaded(changed.map((i) => cells[i]), assetUrlMap);
    if (gen !== generation) return;

    for (const i of changed) {
      if (gen !== generation) break;
      disposePlacedAt(i);
      placeCell(i, cells[i], width, depth, cellSize, assetUrlMap);
    }
  }

  return {
    setLevelCells(cells, width, depth, cellSize, assetUrlMap) {
      const sizeChanged =
        width !== currentWidth ||
        depth !== currentDepth ||
        cellSize !== currentCellSize ||
        assetUrlMap !== currentAssetUrlMap;
      const prevCells = currentCells;
      currentCells = cells;
      currentWidth = width;
      currentDepth = depth;
      currentCellSize = cellSize;
      currentAssetUrlMap = assetUrlMap;

      if (sizeChanged) {
        const gen = ++generation;
        void rebuildAll(cells, width, depth, cellSize, assetUrlMap, gen);
        return;
      }

      const changed: number[] = [];
      const count = Math.max(prevCells.length, cells.length);
      for (let i = 0; i < count; i++) {
        if (cellKey(prevCells[i], assetUrlMap) !== cellKey(cells[i], assetUrlMap)) changed.push(i);
      }
      if (changed.length === 0) return;
      const gen = ++generation;
      void updateChanged(cells, width, depth, cellSize, assetUrlMap, changed, gen);
    },
    setScrollZ(z) {
      scrollZ = Math.max(0, Math.min(z, totalDepth || z));
      syncPositions();
    },
    step(dt) {
      if (paused || totalDepth === 0) return;
      scrollZ = Math.min(scrollZ + dt * SCROLL, totalDepth);
      syncPositions();
    },
    getScrollZ: () => scrollZ,
    getTotalDepth: () => totalDepth,
    setPaused(p) {
      paused = p;
    },
    dispose() {
      clearPlaced();
      for (const t of modelCache.values()) t?.dispose();
      modelCache.clear();
      loadingPromises.clear();
      currentCells = [];
      currentAssetUrlMap = null;
    },
  };
}

function targetHeightForSlot(slot: string, cellSize: number): number {
  const scale = slotScale(slot);
  return Math.max(scale.min, cellSize * scale.cell);
}

function slotScale(slot: string): { min: number; cell: number } {
  if (SLOT_PLACEMENT_SCALE[slot]) return SLOT_PLACEMENT_SCALE[slot];
  if (slot.startsWith("animal-")) return { min: 5, cell: 0.65 };
  if (slot.startsWith("prop-fruit")) return { min: 2.5, cell: 0.3 };
  if (slot.startsWith("model:")) {
    // Catalog value "model:pack/model_name" — infer from the model name segment.
    const name = (slot.split("/").pop() ?? "").toLowerCase();
    if (/tree|pine|palm|oak|birch/.test(name))   return { min: 22, cell: 2.4 };
    if (/bush|shrub|hedge/.test(name))            return { min: 4,  cell: 0.5 };
    if (/grass|plant|flower/.test(name))          return { min: 3,  cell: 0.4 };
    if (/rock|stone|boulder/.test(name))          return { min: 4,  cell: 0.5 };
    if (/cactus/.test(name))                      return { min: 8,  cell: 0.9 };
    if (/log|stump/.test(name))                   return { min: 4,  cell: 0.5 };
    if (/building|house|tower|castle/.test(name)) return { min: 15, cell: 1.8 };
    if (/chest|crate|barrel|box/.test(name))      return { min: 5,  cell: 0.65 };
    if (/animal|sloth|bunny|rabbit|fox|bear|duck|cow|pig|sheep|chicken|fish/.test(name))
      return { min: 4, cell: 0.55 };
    return { min: 8, cell: 1.0 }; // unknown catalog model: scale to ~1 cellSize
  }
  return DEFAULT_PLACEMENT_SCALE;
}
