import {
  type AbstractMesh,
  Color3,
  DynamicTexture,
  MeshBuilder,
  StandardMaterial,
  type Scene,
  type TransformNode,
} from "@babylonjs/core";
import type { PerfRecorder } from "./perf-metrics";
import { SHIP_START_Z } from "./scene-config";
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
  setRenderWindowRows(backRows: number, forwardRows: number): void;
  setScrollZ(z: number): void;
  getStats(): { placedCells: number; placedMeshes: number };
  dispose(): void;
}

const PLANE_Y = 0.02;
const PLANE_DEPTH = 1000;
const PLANE_CENTER_Z = 400;
const PLANE_NEAR_Z = PLANE_CENTER_Z - PLANE_DEPTH / 2;
const PLANE_FAR_Z = PLANE_CENTER_Z + PLANE_DEPTH / 2;
const CELL_PX = 12;
// The cheap dynamic texture covers the full runway; GLB terrain stays
// row-windowed around the ship so the builder does not flood the scene with
// active meshes.
const DEFAULT_MODEL_ROWS_BACK = 6;
const DEFAULT_MODEL_ROWS_FORWARD = 14;
const MAX_MODEL_WINDOW_ROWS = 96;
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
  meshCount: number;
}

interface TerrainBounds {
  minX: number;
  maxX: number;
  minY: number;
  minZ: number;
  maxZ: number;
}

export function createLevelTerrainLayer(scene: Scene, perf?: PerfRecorder): LevelTerrainLayerController {
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
  let currentAssetUrls: Record<string, string> | null = null;
  let scrollZ = 0;
  let surfaceKey = "";
  let visiblePlacementKey = "";
  let renderRowsBack = DEFAULT_MODEL_ROWS_BACK;
  let renderRowsForward = DEFAULT_MODEL_ROWS_FORWARD;
  const modelCache = new Map<string, AbstractMesh | null>();
  const loadingPromises = new Map<string, Promise<void>>();
  const placed = new Map<number, PlacedTerrain>();
  // Incremented on every setTerrainCells call so stale async completions self-abort.
  let generation = 0;
  // False until a full placement pass completes; a partial update arriving before
  // that escalates back to a full rebuild so an interrupted pass can't leave holes.
  let fullBuildDone = false;

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
    mesh.receiveShadows = true;
  }

  function repaint() {
    const t0 = performance.now();
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
    perf?.sample("terrain.repaint", performance.now() - t0);
  }

  function clearPlaced() {
    for (const p of placed.values()) p.node.dispose();
    placed.clear();
  }

  function disposePlacedAt(index: number) {
    placed.get(index)?.node.dispose();
    placed.delete(index);
  }

  function syncPositions() {
    const bounds = renderWindowBounds();
    for (const p of placed.values()) {
      const z = p.baseZ - scrollZ + p.zOffset;
      unfreezeNode(p.node);
      p.node.position.z = z;
      p.node.setEnabled(z > bounds.nearZ - cellSize && z < bounds.farZ + cellSize);
      freezeNode(p.node);
    }
  }

  function renderWindowBounds() {
    return {
      nearZ: SHIP_START_Z - renderRowsBack * cellSize,
      farZ: SHIP_START_Z + renderRowsForward * cellSize,
    };
  }

  function visibleRowRange(): { first: number; last: number } {
    if (columns <= 0 || rows <= 0 || cellSize <= 0) return { first: 0, last: -1 };
    const { nearZ, farZ } = renderWindowBounds();
    const first = Math.max(
      0,
      Math.floor((rows * cellSize - (farZ + scrollZ)) / cellSize),
    );
    const last = Math.min(
      rows - 1,
      Math.ceil((rows * cellSize - (nearZ + scrollZ)) / cellSize),
    );
    return { first, last };
  }

  function visiblePlacementIndices(): number[] {
    const { first, last } = visibleRowRange();
    if (last < first) return [];
    const indices: number[] = [];
    for (let row = first; row <= last; row++) {
      const base = row * columns;
      for (let col = 0; col < columns; col++) {
        const i = base + col;
        if (meshKey(cells[i])) indices.push(i);
      }
    }
    return indices;
  }

  function nextVisiblePlacementKey(): string {
    const { first, last } = visibleRowRange();
    return `${first}:${last}:${columns}:${rows}:${cellSize}`;
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

  // Identity of the placed mesh for a cell — cells whose key is unchanged keep
  // their existing instance across setTerrainCells calls. Color is texture-only,
  // so it deliberately does not participate.
  function meshKey(cell: LevelTerrainCell | undefined): string {
    if (!cell?.terrain) return "";
    const url = assetUrls[cell.terrain];
    if (!url) return "";
    return `${cell.terrain}|${url}|${cell.rotation ?? 0}`;
  }

  async function ensureModelsLoaded(subset: Array<LevelTerrainCell | undefined>) {
    const uniqueUrls = new Set<string>();
    for (const cell of subset) {
      const url = cell?.terrain ? assetUrls[cell.terrain] : undefined;
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
  }

  function placeCell(i: number) {
    const slot = cells[i]?.terrain;
    if (!slot) return;
    const url = assetUrls[slot];
    if (!url) return;
    const template = modelCache.get(url);
    if (!template) return;

    const col = i % columns;
    const row = Math.floor(i / columns);
    const baseX = (col - columns / 2 + 0.5) * cellSize;
    const baseZ = (rows - 1 - row) * cellSize + cellSize / 2;
    const inst = template.instantiateHierarchy(null);
    if (!inst) return;

    const node = inst as TransformNode;
    node.setEnabled(true);
    const meshes = node.getChildMeshes();
    for (const m of meshes) {
      m.setEnabled(true);
      setReceiveShadows(m);
    }
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
    // addRotation handles GLB roots with rotationQuaternion. Direct assignment to
    // rotation.y can be ignored when a quaternion is active.
    if (rotDeg) node.addRotation(0, -rotDeg * Math.PI / 180, 0);
    freezeNode(node);
    placed.set(i, { node, baseZ, zOffset, meshCount: meshes.length });
  }

  async function rebuildAll(gen: number) {
    fullBuildDone = false;
    clearPlaced();
    visiblePlacementKey = nextVisiblePlacementKey();
    const visible = visiblePlacementIndices();

    const loadT0 = performance.now();
    await ensureModelsLoaded(visible.map((i) => cells[i]));
    perf?.sample("terrain.loadModels", performance.now() - loadT0);
    if (gen !== generation) return;

    const placeT0 = performance.now();
    for (const i of visible) {
      if (gen !== generation) return;
      placeCell(i);
    }
    syncPositions();
    perf?.sample("terrain.place.rebuild", performance.now() - placeT0);
    fullBuildDone = true;
  }

  async function updateChanged(changed: number[], gen: number) {
    perf?.count("terrain.changedCells", changed.length);
    const visibleSet = new Set(visiblePlacementIndices());
    const visibleChanged = changed.filter((i) => visibleSet.has(i));
    const loadT0 = performance.now();
    await ensureModelsLoaded(visibleChanged.map((i) => cells[i]));
    perf?.sample("terrain.loadModels", performance.now() - loadT0);
    if (gen !== generation) return;

    const placeT0 = performance.now();
    for (const i of changed) {
      if (gen !== generation) return;
      disposePlacedAt(i);
      if (visibleSet.has(i)) placeCell(i);
    }
    syncPositions();
    perf?.sample("terrain.place.update", performance.now() - placeT0);
  }

  async function syncVisiblePlacement(gen: number) {
    const nextKey = nextVisiblePlacementKey();
    if (nextKey === visiblePlacementKey && fullBuildDone) {
      syncPositions();
      return;
    }
    visiblePlacementKey = nextKey;
    const visible = visiblePlacementIndices();
    const visibleSet = new Set(visible);

    for (const index of [...placed.keys()]) {
      if (!visibleSet.has(index)) disposePlacedAt(index);
    }

    const toPlace = visible.filter((index) => !placed.has(index));
    if (toPlace.length === 0) {
      syncPositions();
      return;
    }

    const loadT0 = performance.now();
    await ensureModelsLoaded(toPlace.map((i) => cells[i]));
    perf?.sample("terrain.loadModels", performance.now() - loadT0);
    if (gen !== generation) return;

    const placeT0 = performance.now();
    for (const i of toPlace) {
      if (gen !== generation) return;
      placeCell(i);
    }
    syncPositions();
    perf?.sample("terrain.place.visible", performance.now() - placeT0);
  }

  return {
    setTerrainCells(nextCells, nextColumns, nextRows, nextCellSize, nextAssetUrls) {
      const c = Math.max(1, nextColumns);
      const r = Math.max(1, nextRows);
      const s = Math.max(0.001, nextCellSize);
      const sizeChanged =
        c !== columns ||
        r !== rows ||
        s !== cellSize ||
        nextAssetUrls !== currentAssetUrls;
      const prevCells = cells;
      columns = c;
      rows = r;
      cellSize = s;
      cells = nextCells;
      assetUrls = nextAssetUrls;
      currentAssetUrls = nextAssetUrls;
      ensureSurface(columns, cellSize);
      repaint();

      if (sizeChanged || !fullBuildDone) {
        void rebuildAll(++generation);
        return;
      }

      const changed: number[] = [];
      const count = Math.max(prevCells.length, cells.length);
      for (let i = 0; i < count; i++) {
        if (meshKey(prevCells[i]) !== meshKey(cells[i])) changed.push(i);
      }
      if (changed.length === 0) return;
      void updateChanged(changed, ++generation);
    },

    setRenderWindowRows(backRows, forwardRows) {
      const nextBack = clamp(Math.round(backRows), 0, MAX_MODEL_WINDOW_ROWS);
      const nextForward = clamp(Math.round(forwardRows), 0, MAX_MODEL_WINDOW_ROWS);
      if (nextBack === renderRowsBack && nextForward === renderRowsForward) return;
      renderRowsBack = nextBack;
      renderRowsForward = nextForward;
      void syncVisiblePlacement(++generation);
    },

    setScrollZ(z) {
      const nextZ = Math.max(0, z);
      if (Math.abs(nextZ - scrollZ) < 0.001) return;
      scrollZ = nextZ;
      repaint();
      const needsPlacementSync = !fullBuildDone || nextVisiblePlacementKey() !== visiblePlacementKey;
      if (needsPlacementSync) void syncVisiblePlacement(++generation);
      else syncPositions();
    },
    getStats() {
      let placedMeshes = 0;
      for (const p of placed.values()) placedMeshes += p.meshCount;
      return { placedCells: placed.size, placedMeshes };
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

function freezeNode(node: TransformNode) {
  node.freezeWorldMatrix();
  for (const mesh of node.getChildMeshes()) mesh.freezeWorldMatrix();
}

function unfreezeNode(node: TransformNode) {
  node.unfreezeWorldMatrix();
  for (const mesh of node.getChildMeshes()) mesh.unfreezeWorldMatrix();
}

function setReceiveShadows(mesh: AbstractMesh) {
  const instanced = mesh as AbstractMesh & { sourceMesh?: AbstractMesh };
  if (instanced.sourceMesh) {
    instanced.sourceMesh.receiveShadows = true;
    return;
  }
  mesh.receiveShadows = true;
}
