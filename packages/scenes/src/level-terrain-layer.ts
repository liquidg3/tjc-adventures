import {
  type AbstractMesh,
  Color3,
  DynamicTexture,
  MeshBuilder,
  StandardMaterial,
  type Scene,
  type TransformNode,
} from "@babylonjs/core";
import { loadRawModel } from "./ship-materials";

export interface LevelTerrainCell {
  terrain?: string;
  color?: string;
  rotation?: number; // degrees CW from above; renderer applies −rotation×π/180 on Y axis
}

export interface LevelTerrainLayerController {
  setTerrainCells(
    cells: LevelTerrainCell[],
    columns: number,
    rows: number,
    cellSize: number,
    assetUrlMap: Record<string, string>,
  ): void;
  setScrollZ(z: number): void;
  dispose(): void;
}

const PLANE_Y = 0.02;
const PLANE_DEPTH = 1000;
const PLANE_CENTER_Z = 400;
const PLANE_NEAR_Z = PLANE_CENTER_Z - PLANE_DEPTH / 2;
const PLANE_FAR_Z = PLANE_CENTER_Z + PLANE_DEPTH / 2;
const CELL_PX = 12;
const MIN_TEX_SIZE = 64;
const MAX_TEX_SIZE = 4096;
const EMPTY_GROUND = "#f6f8ef";
const GRID_LINE = "rgba(72, 96, 132, 0.55)";
const TERRAIN_FALLBACKS: Record<string, string> = {
  "terrain-a": "#77c77a",
  "terrain-b": "#78b7d8",
  "terrain-c": "#9b8fd2",
};

interface PlacedTerrain {
  node: TransformNode;
  baseZ: number;
  zOffset: number;
}

interface TerrainBounds {
  minX: number;
  maxX: number;
  minY: number;
  minZ: number;
  maxZ: number;
}

export function createLevelTerrainLayer(scene: Scene): LevelTerrainLayerController {
  let mesh: ReturnType<typeof MeshBuilder.CreateGround> | null = null;
  let mat: StandardMaterial | null = null;
  let tex: DynamicTexture | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let texW = 0;
  let texH = 0;
  let columns = 0;
  let rows = 0;
  let cellSize = 1;
  let cells: LevelTerrainCell[] = [];
  let assetUrls: Record<string, string> = {};
  let scrollZ = 0;
  let surfaceKey = "";
  const modelCache = new Map<string, AbstractMesh | null>();
  const loadingPromises = new Map<string, Promise<void>>();
  const placed: PlacedTerrain[] = [];
  let generation = 0;

  function ensureSurface(nextColumns: number, nextCellSize: number) {
    const fieldWidth = nextColumns * nextCellSize;
    const visibleRows = Math.ceil(PLANE_DEPTH / nextCellSize) + 2;
    const nextTexW = clamp(nextColumns * CELL_PX, MIN_TEX_SIZE, MAX_TEX_SIZE);
    const nextTexH = clamp(visibleRows * CELL_PX, MIN_TEX_SIZE, MAX_TEX_SIZE);
    const key = `${fieldWidth}:${nextColumns}:${nextCellSize}:${nextTexW}:${nextTexH}`;
    if (key === surfaceKey) return;
    surfaceKey = key;

    mesh?.dispose();
    mat?.dispose();
    tex?.dispose();

    texW = nextTexW;
    texH = nextTexH;
    tex = new DynamicTexture("level-terrain-tex", { width: texW, height: texH }, scene, false);
    ctx = tex.getContext() as CanvasRenderingContext2D;
    tex.uScale = 1;
    tex.vScale = 1;

    mat = new StandardMaterial("level-terrain-mat", scene);
    mat.diffuseTexture = tex;
    mat.specularColor = Color3.Black();

    mesh = MeshBuilder.CreateGround(
      "level-terrain-ground",
      { width: fieldWidth, height: PLANE_DEPTH },
      scene,
    );
    mesh.position.set(0, PLANE_Y, PLANE_CENTER_Z);
    mesh.material = mat;
    mesh.isPickable = false;
  }

  function repaint() {
    if (!ctx || !tex || columns <= 0 || rows <= 0 || cellSize <= 0) return;

    ctx.clearRect(0, 0, texW, texH);
    ctx.fillStyle = EMPTY_GROUND;
    ctx.fillRect(0, 0, texW, texH);

    const cellWPx = texW / columns;
    const firstVisibleRow = Math.max(0, Math.floor((rows * cellSize - (PLANE_FAR_Z + scrollZ)) / cellSize) - 1);
    const lastVisibleRow = Math.min(rows - 1, Math.ceil((rows * cellSize - (PLANE_NEAR_Z + scrollZ)) / cellSize) + 1);

    for (let row = firstVisibleRow; row <= lastVisibleRow; row++) {
      const baseZ = (rows - 1 - row) * cellSize + cellSize / 2;
      const visualNearZ = baseZ - cellSize / 2 - scrollZ;
      const visualFarZ = baseZ + cellSize / 2 - scrollZ;
      if (visualFarZ < PLANE_NEAR_Z || visualNearZ > PLANE_FAR_Z) continue;

      const yTop = ((PLANE_FAR_Z - visualFarZ) / PLANE_DEPTH) * texH;
      const yBottom = ((PLANE_FAR_Z - visualNearZ) / PLANE_DEPTH) * texH;
      const h = Math.max(1, yBottom - yTop);

      for (let col = 0; col < columns; col++) {
        const cell = cells[row * columns + col];
        if (!cell?.terrain) continue;
        if (assetUrls[cell.terrain]) continue;
        ctx.fillStyle = cell.color ?? TERRAIN_FALLBACKS[cell.terrain] ?? "#a9c98e";
        ctx.fillRect(col * cellWPx, yTop, cellWPx, h);
      }
    }

    ctx.strokeStyle = GRID_LINE;
    ctx.lineWidth = 1;
    for (let row = firstVisibleRow; row <= lastVisibleRow; row++) {
      const baseZ = (rows - 1 - row) * cellSize + cellSize / 2;
      const visualNearZ = baseZ - cellSize / 2 - scrollZ;
      const visualFarZ = baseZ + cellSize / 2 - scrollZ;
      if (visualFarZ < PLANE_NEAR_Z || visualNearZ > PLANE_FAR_Z) continue;

      const yTop = ((PLANE_FAR_Z - visualFarZ) / PLANE_DEPTH) * texH;
      const yBottom = ((PLANE_FAR_Z - visualNearZ) / PLANE_DEPTH) * texH;
      const h = Math.max(1, yBottom - yTop);

      for (let col = 0; col < columns; col++) {
        if (cells[row * columns + col]?.terrain) continue;
        ctx.strokeRect(col * cellWPx, yTop, cellWPx, h);
      }
    }

    tex.update();
  }

  function clearPlaced() {
    for (const p of placed) p.node.dispose();
    placed.length = 0;
  }

  function syncPositions() {
    for (const p of placed) {
      const z = p.baseZ - scrollZ + p.zOffset;
      p.node.position.z = z;
      p.node.setEnabled(z > PLANE_NEAR_Z - cellSize && z < PLANE_FAR_Z + cellSize);
    }
  }

  function getTerrainBounds(meshes: AbstractMesh[]): TerrainBounds | null {
    let bounds: TerrainBounds | null = null;
    for (const m of meshes) {
      if (m.getTotalVertices() <= 0) continue;
      m.computeWorldMatrix(true);
      const box = m.getBoundingInfo().boundingBox;
      const min = box.minimumWorld;
      const max = box.maximumWorld;
      if (!bounds) {
        bounds = {
          minX: min.x,
          maxX: max.x,
          minY: min.y,
          minZ: min.z,
          maxZ: max.z,
        };
        continue;
      }
      bounds.minX = Math.min(bounds.minX, min.x);
      bounds.maxX = Math.max(bounds.maxX, max.x);
      bounds.minY = Math.min(bounds.minY, min.y);
      bounds.minZ = Math.min(bounds.minZ, min.z);
      bounds.maxZ = Math.max(bounds.maxZ, max.z);
    }
    return bounds;
  }

  async function loadAndPlaceTerrain(gen: number) {
    clearPlaced();

    const uniqueUrls = new Set<string>();
    for (const cell of cells) {
      const url = cell.terrain ? assetUrls[cell.terrain] : undefined;
      if (url) uniqueUrls.add(url);
    }

    await Promise.all([...uniqueUrls].map((url) => {
      if (modelCache.has(url)) return;
      if (loadingPromises.has(url)) return loadingPromises.get(url);
      const p = loadRawModel(url, scene).then((root) => {
        root?.setEnabled(false);
        modelCache.set(url, root ?? null);
        loadingPromises.delete(url);
      });
      loadingPromises.set(url, p);
      return p;
    }));

    if (gen !== generation) return;

    for (let i = 0; i < cells.length; i++) {
      if (gen !== generation) break;

      const slot = cells[i]?.terrain;
      if (!slot) continue;
      const url = assetUrls[slot];
      if (!url) continue;
      const template = modelCache.get(url);
      if (!template) continue;

      const col = i % columns;
      const row = Math.floor(i / columns);
      const baseX = (col - columns / 2 + 0.5) * cellSize;
      const baseZ = (rows - 1 - row) * cellSize + cellSize / 2;
      const inst = template.instantiateHierarchy(null);
      if (!inst) continue;

      const node = inst as TransformNode;
      node.setEnabled(true);
      for (const mesh of node.getChildMeshes()) mesh.setEnabled(true);
      const meshes = node.getChildMeshes();
      const bounds = getTerrainBounds(meshes);
      if (bounds) {
        const footprint = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) || 1;
        node.scaling.setAll(cellSize / footprint);
      }

      const scaledBounds = getTerrainBounds(meshes);
      const centerX = scaledBounds ? (scaledBounds.minX + scaledBounds.maxX) / 2 : 0;
      const centerZ = scaledBounds ? (scaledBounds.minZ + scaledBounds.maxZ) / 2 : 0;
      const minY = scaledBounds?.minY ?? 0;
      const zOffset = -centerZ;
      node.position.set(baseX - centerX, PLANE_Y + 0.08 - minY, baseZ - scrollZ + zOffset);
      const rotDeg = cells[i]?.rotation ?? 0;
      if (rotDeg) node.rotation.y = -rotDeg * Math.PI / 180;
      placed.push({ node, baseZ, zOffset });
    }

    syncPositions();
  }

  return {
    setTerrainCells(nextCells, nextColumns, nextRows, nextCellSize, nextAssetUrls) {
      columns = Math.max(1, nextColumns);
      rows = Math.max(1, nextRows);
      cellSize = Math.max(0.001, nextCellSize);
      cells = nextCells;
      assetUrls = nextAssetUrls;
      ensureSurface(columns, cellSize);
      repaint();
      void loadAndPlaceTerrain(++generation);
    },

    setScrollZ(z) {
      scrollZ = Math.max(0, z);
      repaint();
      syncPositions();
    },

    dispose() {
      clearPlaced();
      for (const t of modelCache.values()) t?.dispose();
      modelCache.clear();
      loadingPromises.clear();
      mesh?.dispose();
      mat?.dispose();
      tex?.dispose();
      mesh = null;
      mat = null;
      tex = null;
      ctx = null;
    },
  };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
