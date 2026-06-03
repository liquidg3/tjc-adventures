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
}

export interface LevelPropLayerController {
  setLevelCells(
    cells: LevelGridCell[],
    width: number,
    depth: number,
    cellSize: number,
    assetUrlMap: Record<string, string>,
  ): Promise<void>;
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
  const modelCache = new Map<string, TransformNode | null>();
  const placed: PlacedProp[] = [];
  let scrollZ = 0;
  let totalDepth = 0;
  let paused = false;

  function clearPlaced() {
    for (const p of placed) p.node.dispose();
    placed.length = 0;
  }

  function syncPositions() {
    for (const p of placed) {
      const z = p.baseZ - scrollZ;
      p.node.position.z = z;
      p.node.setEnabled(z > -60 && z < 900);
    }
  }

  async function setLevelCells(
    cells: LevelGridCell[],
    width: number,
    depth: number,
    cellSize: number,
    assetUrlMap: Record<string, string>,
  ) {
    clearPlaced();
    totalDepth = depth * cellSize;

    const uniqueUrls = new Set<string>();
    for (const cell of cells) {
      if (cell.prop) {
        const url = assetUrlMap[cell.prop];
        if (url) uniqueUrls.add(url);
      }
    }

    await Promise.all(
      [...uniqueUrls]
        .filter((url) => !modelCache.has(url))
        .map(async (url) => {
          const template = await loadModel(url, scene);
          modelCache.set(url, template ?? null);
        }),
    );

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (!cell.prop) continue;
      const url = assetUrlMap[cell.prop];
      if (!url) continue;
      const template = modelCache.get(url);
      if (!template) continue;

      const col = i % width;
      const row = Math.floor(i / width);
      // row 0 = far end of level (largest Z — first thing you fly toward)
      const baseX = (col - width / 2 + 0.5) * cellSize;
      const baseZ = (depth - 1 - row) * cellSize + cellSize / 2;

      const inst = template.instantiateHierarchy(null);
      if (!inst) continue;
      const node = inst as TransformNode;
      const meshes = node.getChildMeshes();
      const rootMesh = meshes[0];
      const targetH = targetHeightForSlot(cell.prop, cellSize);
      const s = rootMesh ? fitScale(rootMesh as AbstractMesh, targetH) : 1;
      node.scaling.setAll(s);
      node.position.set(baseX, (cell.height ?? 0) * HEIGHT_STEP_WU, baseZ - scrollZ);
      placed.push({ node, baseZ });
    }
  }

  return {
    setLevelCells,
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
    },
  };
}

function targetHeightForSlot(slot: string, cellSize: number): number {
  const scale =
    SLOT_PLACEMENT_SCALE[slot] ??
    (slot.startsWith("animal-")
      ? { min: 5, cell: 0.65 }
      : slot.startsWith("prop-fruit")
        ? { min: 2.5, cell: 0.3 }
        : DEFAULT_PLACEMENT_SCALE);
  return Math.max(scale.min, cellSize * scale.cell);
}
