import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createShipScene,
  type LevelGridCell,
  type LevelTerrainCell,
  type SceneHandle,
} from "@tjc/scenes";
import {
  assetValueToUrl,
  getAssignedModelValue,
  parseAssetAssignments,
} from "./asset-normalization";
import {
  cellIndex,
  emptyLevel,
  makePlacementId,
  MAX_HEIGHT,
  mergeLevel,
  projectObjectsToLegacyCells,
  type Level,
  type TerrainCell,
  type TerrainFeatureFamily,
  type TerrainRotation,
} from "./level-builder-state";
import {
  buildTerrainFeatureLookup,
  resolveTerrainFeatureFallback,
  availableFeatureFamilies,
  type TerrainModelLookup,
} from "./terrain-feature-resolver";
import {
  terrainMaskForCell,
  terrainShapeForMask,
} from "./terrain-connectivity";
import { SLOTS } from "./slots";
import { loadStagedModels, type ModelEntry } from "./models";
import {
  buildModelCatalog,
  EMPTY_MODEL_CATALOG_OVERRIDES,
  parseModelCatalogOverrides,
  type ModelCatalogOverrides,
} from "./model-catalog";
import { usePersistedJson } from "./use-persisted-json";
import { type PaintMode } from "./level-builder-types";
import { LevelPanel, ColumnChangeConfirm, PaintPanel, PreviewPanel } from "./level-panels";
import { PalettePanel, formatModelLabel } from "./level-palette";
import { GridPanel } from "./level-grid";

const LEVEL_URL = "/__level-builder";
const ASSET_MAP_URL = "/__asset-map";
const MODEL_CATALOG_OVERRIDES_URL = "/__model-catalog-overrides";


const SLOT_COLORS = [
  "#7fc97f", "#beaed4", "#fdc086", "#ffff99", "#386cb0",
  "#f0027f", "#bf5b17", "#666666", "#a6cee3", "#fb9a99",
];

export function LevelBuilder() {
  const { value: level, setValue: setLevel, saved, loaded } = usePersistedJson(
    LEVEL_URL,
    emptyLevel(),
    mergeLevel,
  );
  const [mode, setMode] = useState<PaintMode>("terrain");
  const [selectedTerrain, setSelectedTerrain] = useState("");
  const [selectedObject, setSelectedObject] = useState("");
  const [selectedHeight, setSelectedHeight] = useState(1);
  const [terrainBrushMode, setTerrainBrushMode] = useState<"manual" | "connected">("manual");
  const [connectedFamily, setConnectedFamily] = useState<TerrainFeatureFamily>("river");
  const [brushShape, setBrushShape] = useState<"free" | "rect">("free");
  const [eraseActive, setEraseActive] = useState(false);
  const rectAnchorRef = useRef<{ col: number; row: number } | null>(null);
  const [rectPreview, setRectPreview] = useState<{ minCol: number; maxCol: number; minRow: number; maxRow: number } | null>(null);
  const [assignedSlots, setAssignedSlots] = useState<string[]>([]);
  const [legacyAssetUrlMap, setLegacyAssetUrlMap] = useState<Record<string, string>>({});
  const [modelEntries, setModelEntries] = useState<ModelEntry[]>([]);
  const [paused, setPaused] = useState(true);
  const [scrollZ, setScrollZ] = useState(0);
  const [fps, setFps] = useState(0);
  const [pendingClear, setPendingClear] = useState(false);
  const [pendingColumns, setPendingColumns] = useState<number | null>(null);

  const pointerDown = useRef(false);
  const pausedBeforeScrub = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<SceneHandle | null>(null);
  const rafRef = useRef<number | null>(null);
  const catalogOverrides = usePersistedJson<ModelCatalogOverrides>(
    MODEL_CATALOG_OVERRIDES_URL,
    EMPTY_MODEL_CATALOG_OVERRIDES,
    parseModelCatalogOverrides,
  );

  useEffect(() => {
    fetch(ASSET_MAP_URL)
      .then((r) => r.json())
      .then((data) => {
        const assignments = parseAssetAssignments(data);
        const slots = SLOTS.flatMap((category) => category.slots)
          .map((slot) => slot.id)
          .filter((id) => getAssignedModelValue(assignments[id]) && !id.startsWith("ship-"));

        setAssignedSlots(slots);

        const urls: Record<string, string> = {};
        for (const id of slots) {
          const url = assetValueToUrl(getAssignedModelValue(assignments[id]));
          if (url) urls[id] = url;
        }
        setLegacyAssetUrlMap(urls);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadStagedModels().then(setModelEntries).catch(() => {});
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const handle = createShipScene(canvasRef.current);
    handleRef.current = handle;
    handle.setPlayerShipVisible(false);
    handle.setLevelScrollPaused(true);
    handle.setGroundStyle("white");
    return () => {
      handle.dispose();
      handleRef.current = null;
    };
  }, []);

  const catalog = useMemo(
    () => buildModelCatalog(modelEntries, catalogOverrides.value),
    [modelEntries, catalogOverrides.value],
  );
  const catalogTerrainItems = useMemo(
    () => catalog.filter((m) => m.usage.showInLevelBuilder && m.usage.terrain),
    [catalog],
  );
  const catalogObjectItems = useMemo(
    () => catalog.filter((m) => m.usage.showInLevelBuilder && m.usage.object),
    [catalog],
  );
  const terrainFeatureLookup = useMemo(
    () => buildTerrainFeatureLookup(catalog),
    [catalog],
  );
  const packForSlot = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of catalog) map[m.modelValue] = m.packName;
    return map;
  }, [catalog]);
  const featureFamilies = useMemo(
    () => availableFeatureFamilies(terrainFeatureLookup),
    [terrainFeatureLookup],
  );
  const assetUrlMap = useMemo(() => {
    const urls: Record<string, string> = { ...legacyAssetUrlMap };
    for (const model of catalog) urls[model.modelValue] = model.url;
    return urls;
  }, [legacyAssetUrlMap, catalog]);

  const paletteIds = useMemo(
    () => [
      ...catalogTerrainItems.map((m) => m.modelValue),
      ...catalogObjectItems.map((m) => m.modelValue),
    ],
    [catalogTerrainItems, catalogObjectItems],
  );

  const slotColor = useMemo(() => {
    const colors: Record<string, string> = {};
    paletteIds.forEach((id, i) => {
      colors[id] = SLOT_COLORS[i % SLOT_COLORS.length];
    });
    return colors;
  }, [paletteIds]);

  useEffect(() => {
    setSelectedTerrain((current) => current || catalogTerrainItems[0]?.modelValue || "");
    setSelectedObject((current) => current || catalogObjectItems[0]?.modelValue || "");
  }, [catalogTerrainItems, catalogObjectItems]);

  useEffect(() => {
    if (!loaded || !handleRef.current) return;
    handleRef.current.setLevelCells(
      projectObjectsToLegacyCells(level) as LevelGridCell[],
      level.columns,
      level.rows,
      level.cellSize,
      assetUrlMap,
    );
    const terrainPreviewCells = level.layers.terrain.map((cell) => ({
      terrain: cell.terrain,
      color: cell.terrain ? slotColor[cell.terrain] : undefined,
      rotation: cell.feature?.rotation ?? cell.rotation,
    }));
    handleRef.current.setLevelTerrainCells(
      terrainPreviewCells as LevelTerrainCell[],
      level.columns,
      level.rows,
      level.cellSize,
      assetUrlMap,
    );
  }, [level, assetUrlMap, loaded, slotColor]);

  useEffect(() => {
    handleRef.current?.setLevelScrollPaused(paused);
  }, [paused]);

  useEffect(() => {
    function tick() {
      const h = handleRef.current;
      setScrollZ(h?.getLevelScrollZ() ?? 0);
      setFps(Math.round(h?.getFps() ?? 0));
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const catalogLabelMap = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const model of catalog) labels[model.modelValue] = formatModelLabel(model.name);
    return labels;
  }, [catalog]);
  const paletteSlots = mode === "terrain"
    ? catalogTerrainItems.map((m) => m.modelValue)
    : mode === "object"
      ? catalogObjectItems.map((m) => m.modelValue)
      : [];
  const totalDepth = level.rows * level.cellSize;
  const progressRow = Math.min(level.rows - 1, Math.floor(scrollZ / level.cellSize));
  const currentGridRow = level.rows - 1 - progressRow;
  const progressPct = totalDepth > 0 ? (scrollZ / totalDepth) * 100 : 0;
  const cols = useMemo(() => Array.from({ length: level.columns }, (_, i) => i), [level.columns]);
  const fallbackCount = useMemo(
    () => level.layers.terrain.filter((c) => c.feature?.fallback).length,
    [level],
  );

  function paintCell(col: number, row: number, isInitialDown = false) {
    if (eraseActive) { eraseCell(col, row); return; }
    if (mode === "terrain") {
      if (terrainBrushMode === "connected") paintConnectedFeature(col, row);
      else paintTerrainManual(col, row, isInitialDown);
    } else if (mode === "object") paintObject(col, row, isInitialDown);
    else paintHeight(col, row);
  }

  function paintTerrainManual(col: number, row: number, allowRotate = false) {
    if (!selectedTerrain) return;
    setLevel((prev) => {
      const i = cellIndex(prev, col, row);
      if (i < 0) return prev;
      const terrain = [...prev.layers.terrain];
      const existing = prev.layers.terrain[i];
      if (allowRotate && existing?.terrain === selectedTerrain && !existing.feature) {
        // Same model, initial click — cycle rotation 0→90→180→270→0
        const nextRotation = (((existing.rotation ?? 0) + 90) % 360) as TerrainRotation;
        terrain[i] = { terrain: selectedTerrain, rotation: nextRotation };
        return { ...prev, layers: { ...prev.layers, terrain } };
      }
      if (existing?.terrain === selectedTerrain && !existing.feature) return prev;
      // New model or was a feature — place fresh (clears feature metadata).
      terrain[i] = { terrain: selectedTerrain };
      return { ...prev, layers: { ...prev.layers, terrain } };
    });
  }

  function rotateCellAt(col: number, row: number) {
    setLevel((prev) => {
      const i = cellIndex(prev, col, row);
      if (i < 0) return prev;

      let changed = false;
      const terrain = [...prev.layers.terrain];
      const objects = [...prev.layers.objects];

      const existingTerrain = prev.layers.terrain[i];
      if (existingTerrain?.terrain) {
        if (existingTerrain.feature) {
          const nextR = (((existingTerrain.feature.rotation ?? 0) + 90) % 360) as TerrainRotation;
          terrain[i] = { ...existingTerrain, feature: { ...existingTerrain.feature, rotation: nextR, manual: true } };
        } else {
          const nextR = (((existingTerrain.rotation ?? 0) + 90) % 360) as TerrainRotation;
          terrain[i] = { ...existingTerrain, rotation: nextR };
        }
        changed = true;
      }

      const existingObjs = prev.layers.objects[i]?.objects;
      if (existingObjs?.length) {
        const obj = existingObjs[0];
        const nextR = ((obj.rotation ?? 0) + 90) % 360;
        objects[i] = { objects: [{ ...obj, rotation: nextR }, ...existingObjs.slice(1)] };
        changed = true;
      }

      if (!changed) return prev;
      return { ...prev, layers: { ...prev.layers, terrain, objects } };
    });
  }

  function paintConnectedFeature(col: number, row: number) {
    const family = connectedFamily;
    setLevel((prev) => {
      const i = cellIndex(prev, col, row);
      if (i < 0) return prev;

      // No-op if this cell already belongs to the same non-manual family.
      const existing = prev.layers.terrain[i];
      if (existing?.feature?.family === family && !existing.feature.manual) return prev;

      // Clone and mark target as family member (placeholder shape resolved below).
      const terrain = [...prev.layers.terrain];
      terrain[i] = { ...terrain[i], feature: { family, shape: "tile", rotation: 0, modelId: "" } };

      // Collect target + same-family neighbors for shape recompute.
      const toRecompute: Array<{ col: number; row: number }> = [{ col, row }];
      const offsets = [
        { dc: 0, dr: -1 }, { dc: 1, dr: 0 },
        { dc: 0, dr: 1 },  { dc: -1, dr: 0 },
      ];
      for (const { dc, dr } of offsets) {
        const nc = col + dc;
        const nr = row + dr;
        const ni = cellIndex(prev, nc, nr);
        if (ni >= 0 && terrain[ni]?.feature?.family === family) {
          toRecompute.push({ col: nc, row: nr });
        }
      }

      for (const { col: rc, row: rr } of toRecompute) {
        recomputeFeatureCell(
          cellIndex(prev, rc, rr),
          rc,
          rr,
          terrain,
          prev.columns,
          prev.rows,
          family,
          terrainFeatureLookup,
        );
      }
      return { ...prev, layers: { ...prev.layers, terrain } };
    });
  }

  function recomputeFeatureCell(
    i: number,
    col: number,
    row: number,
    terrain: TerrainCell[],
    columns: number,
    rows: number,
    family: TerrainFeatureFamily,
    lookup: TerrainModelLookup,
  ) {
    if (i < 0) return;
    const cell = terrain[i];
    if (!cell?.feature || cell.feature.manual) return;

    const mask = terrainMaskForCell(terrain, columns, rows, col, row, family);
    const { shape, rotation } = terrainShapeForMask(mask);
    const result = resolveTerrainFeatureFallback(lookup, family, shape);
    const modelId = result?.model.modelValue ?? "";
    const isFallback = result !== null && result.usedShape !== shape;

    if (!modelId) {
      console.warn(`[TJC] terrain-feature: no model for ${family}+${shape} (col=${col} row=${row})`);
    }

    terrain[i] = {
      ...terrain[i],
      terrain: modelId || undefined,
      feature: {
        family, shape, rotation, modelId,
        ...(cell.feature.manual ? { manual: true } : {}),
        ...(isFallback ? { fallback: true } : {}),
      },
    };
  }

  function paintObject(col: number, row: number, allowRotate = false) {
    if (!selectedObject) return;
    setLevel((prev) => {
      const i = cellIndex(prev, col, row);
      if (i < 0) return prev;
      const existing = prev.layers.objects[i]?.objects?.[0];
      const objects = [...prev.layers.objects];
      if (existing?.slot === selectedObject) {
        if (!allowRotate) return prev;
        // Same model, initial click — cycle rotation
        const nextR = ((existing.rotation ?? 0) + 90) % 360;
        objects[i] = { objects: [{ ...existing, rotation: nextR }] };
        return { ...prev, layers: { ...prev.layers, objects } };
      }
      objects[i] = {
        objects: [{ id: makePlacementId(col, row, selectedObject), slot: selectedObject }],
      };
      return { ...prev, layers: { ...prev.layers, objects } };
    });
  }

  function paintHeight(col: number, row: number) {
    setLevel((prev) => {
      const i = cellIndex(prev, col, row);
      if (i < 0 || prev.layers.height[i]?.height === selectedHeight) return prev;
      const height = [...prev.layers.height];
      height[i] = selectedHeight > 0 ? { height: selectedHeight } : {};
      return { ...prev, layers: { ...prev.layers, height } };
    });
  }

  function eraseCell(col: number, row: number) {
    const eraseTerrain = mode === "terrain";
    const eraseObjects = mode === "object";
    const eraseHeight  = mode === "height";
    setLevel((prev) => {
      const i = cellIndex(prev, col, row);
      if (i < 0) return prev;

      if (
        !(eraseTerrain && (prev.layers.terrain[i]?.terrain || prev.layers.terrain[i]?.feature)) &&
        !(eraseObjects && prev.layers.objects[i]?.objects?.length) &&
        !(eraseHeight  && prev.layers.height[i]?.height)
      ) return prev;

      const oldFamily = eraseTerrain ? prev.layers.terrain[i]?.feature?.family : undefined;
      const terrain = [...prev.layers.terrain];
      const height  = [...prev.layers.height];
      const objects = [...prev.layers.objects];
      if (eraseTerrain) terrain[i] = {};
      if (eraseHeight)  height[i]  = {};
      if (eraseObjects) objects[i] = {};

      // Recompute connected-feature neighbors that lost a connection.
      if (oldFamily) {
        const offsets = [
          { dc: 0, dr: -1 }, { dc: 1, dr: 0 },
          { dc: 0, dr: 1 },  { dc: -1, dr: 0 },
        ];
        for (const { dc, dr } of offsets) {
          const nc = col + dc;
          const nr = row + dr;
          const ni = cellIndex(prev, nc, nr);
          if (ni >= 0 && terrain[ni]?.feature?.family === oldFamily && !terrain[ni]?.feature?.manual) {
            recomputeFeatureCell(ni, nc, nr, terrain, prev.columns, prev.rows, oldFamily, terrainFeatureLookup);
          }
        }
      }

      return { ...prev, layers: { terrain, height, objects } };
    });
  }

  function rebuildConnections() {
    setLevel((prev) => {
      const terrain = [...prev.layers.terrain];
      let hasFeature = false;
      for (let i = 0; i < terrain.length; i++) {
        const cell = terrain[i];
        if (!cell?.feature || cell.feature.manual) continue;
        hasFeature = true;
        const col = i % prev.columns;
        const row = Math.floor(i / prev.columns);
        recomputeFeatureCell(i, col, row, terrain, prev.columns, prev.rows, cell.feature.family, terrainFeatureLookup);
      }
      if (!hasFeature) return prev;
      return { ...prev, layers: { ...prev.layers, terrain } };
    });
  }

  function changeBrushShape(shape: "free" | "rect") {
    pointerDown.current = false;
    rectAnchorRef.current = null;
    setRectPreview(null);
    setBrushShape(shape);
  }

  // actionRef lets the stable useCallback handlers always call the latest version
  // of paintCell/rotateCellTerrain/etc. without capturing stale closures.
  const actionRef = useRef({ paintCell, rotateCellAt, brushShape, commitRect });
  actionRef.current = { paintCell, rotateCellAt, brushShape, commitRect };

  const handleCellDown = useCallback((col: number, row: number) => {
    pointerDown.current = true;
    if (actionRef.current.brushShape === "rect") {
      rectAnchorRef.current = { col, row };
      setRectPreview({ minCol: col, maxCol: col, minRow: row, maxRow: row });
    } else {
      actionRef.current.paintCell(col, row, true);
    }
  }, []);

  const handleCellRightDown = useCallback((col: number, row: number) => {
    actionRef.current.rotateCellAt(col, row);
  }, []);

  const handleCellEnter = useCallback((col: number, row: number) => {
    if (!pointerDown.current) return;
    if (actionRef.current.brushShape === "rect" && rectAnchorRef.current) {
      const a = rectAnchorRef.current;
      setRectPreview({
        minCol: Math.min(a.col, col), maxCol: Math.max(a.col, col),
        minRow: Math.min(a.row, row), maxRow: Math.max(a.row, row),
      });
    } else if (actionRef.current.brushShape === "free") {
      actionRef.current.paintCell(col, row);
    }
  }, []);

  function handleGridUp() {
    if (actionRef.current.brushShape === "rect" && pointerDown.current && rectPreview) {
      actionRef.current.commitRect(rectPreview);
    }
    pointerDown.current = false;
    rectAnchorRef.current = null;
    setRectPreview(null);
  }

  function handleGridLeave() {
    pointerDown.current = false;
    rectAnchorRef.current = null;
    setRectPreview(null);
  }

  function commitRect(rect: { minCol: number; maxCol: number; minRow: number; maxRow: number }) {
    const cells: Array<{ col: number; row: number }> = [];
    for (let r = rect.minRow; r <= rect.maxRow; r++) {
      for (let c = rect.minCol; c <= rect.maxCol; c++) cells.push({ col: c, row: r });
    }
    if (cells.length === 0) return;
    if (eraseActive) { eraseRect(cells); return; }
    if (mode === "terrain") {
      if (terrainBrushMode === "connected") paintConnectedFeatureRect(cells);
      else paintTerrainManualRect(cells);
    } else if (mode === "object") paintObjectRect(cells);
    else paintHeightRect(cells);
  }

  function paintTerrainManualRect(cells: Array<{ col: number; row: number }>) {
    if (!selectedTerrain) return;
    setLevel((prev) => {
      const terrain = [...prev.layers.terrain];
      let changed = false;
      for (const { col, row } of cells) {
        const i = cellIndex(prev, col, row);
        if (i < 0 || terrain[i]?.terrain === selectedTerrain) continue;
        terrain[i] = { terrain: selectedTerrain };
        changed = true;
      }
      return changed ? { ...prev, layers: { ...prev.layers, terrain } } : prev;
    });
  }

  function paintObjectRect(cells: Array<{ col: number; row: number }>) {
    if (!selectedObject) return;
    setLevel((prev) => {
      const objects = [...prev.layers.objects];
      let changed = false;
      for (const { col, row } of cells) {
        const i = cellIndex(prev, col, row);
        if (i < 0 || objects[i]?.objects?.[0]?.slot === selectedObject) continue;
        objects[i] = { objects: [{ id: makePlacementId(col, row, selectedObject), slot: selectedObject }] };
        changed = true;
      }
      return changed ? { ...prev, layers: { ...prev.layers, objects } } : prev;
    });
  }

  function paintHeightRect(cells: Array<{ col: number; row: number }>) {
    setLevel((prev) => {
      const height = [...prev.layers.height];
      let changed = false;
      for (const { col, row } of cells) {
        const i = cellIndex(prev, col, row);
        if (i < 0 || height[i]?.height === selectedHeight) continue;
        height[i] = selectedHeight > 0 ? { height: selectedHeight } : {};
        changed = true;
      }
      return changed ? { ...prev, layers: { ...prev.layers, height } } : prev;
    });
  }

  function eraseRect(cells: Array<{ col: number; row: number }>) {
    const eraseTerrain = mode === "terrain";
    const eraseObjects = mode === "object";
    const eraseHeight  = mode === "height";
    setLevel((prev) => {
      const terrain = [...prev.layers.terrain];
      const height  = [...prev.layers.height];
      const objects = [...prev.layers.objects];
      const erasedSet = new Set(cells.map(({ col, row }) => cellIndex(prev, col, row)).filter((i) => i >= 0));
      let changed = false;
      const erasedFeatures: Array<{ col: number; row: number; family: TerrainFeatureFamily }> = [];

      for (const { col, row } of cells) {
        const i = cellIndex(prev, col, row);
        if (i < 0) continue;
        if (
          !(eraseTerrain && (terrain[i]?.terrain || terrain[i]?.feature)) &&
          !(eraseObjects && objects[i]?.objects?.length) &&
          !(eraseHeight  && height[i]?.height)
        ) continue;
        if (eraseTerrain && terrain[i]?.feature?.family) erasedFeatures.push({ col, row, family: terrain[i].feature!.family });
        if (eraseTerrain) terrain[i] = {};
        if (eraseHeight)  height[i]  = {};
        if (eraseObjects) objects[i] = {};
        changed = true;
      }

      if (!changed) return prev;

      const offsets = [{ dc: 0, dr: -1 }, { dc: 1, dr: 0 }, { dc: 0, dr: 1 }, { dc: -1, dr: 0 }];
      for (const { col, row, family } of erasedFeatures) {
        for (const { dc, dr } of offsets) {
          const ni = cellIndex(prev, col + dc, row + dr);
          if (ni >= 0 && !erasedSet.has(ni) && terrain[ni]?.feature?.family === family && !terrain[ni]?.feature?.manual) {
            recomputeFeatureCell(ni, col + dc, row + dr, terrain, prev.columns, prev.rows, family, terrainFeatureLookup);
          }
        }
      }

      return { ...prev, layers: { terrain, height, objects } };
    });
  }

  function paintConnectedFeatureRect(cells: Array<{ col: number; row: number }>) {
    const family = connectedFamily;
    setLevel((prev) => {
      const terrain = [...prev.layers.terrain];

      for (const { col, row } of cells) {
        const i = cellIndex(prev, col, row);
        if (i < 0) continue;
        const existing = terrain[i];
        if (existing?.feature?.family === family && !existing.feature.manual) continue;
        terrain[i] = { ...terrain[i], feature: { family, shape: "tile", rotation: 0, modelId: "" } };
      }

      const toRecompute = new Set<number>();
      const offsets = [{ dc: 0, dr: -1 }, { dc: 1, dr: 0 }, { dc: 0, dr: 1 }, { dc: -1, dr: 0 }];
      for (const { col, row } of cells) {
        const i = cellIndex(prev, col, row);
        if (i >= 0 && terrain[i]?.feature?.family === family) toRecompute.add(i);
        for (const { dc, dr } of offsets) {
          const ni = cellIndex(prev, col + dc, row + dr);
          if (ni >= 0 && terrain[ni]?.feature?.family === family) toRecompute.add(ni);
        }
      }

      for (const i of toRecompute) {
        const col = i % prev.columns;
        const row = Math.floor(i / prev.columns);
        recomputeFeatureCell(i, col, row, terrain, prev.columns, prev.rows, family, terrainFeatureLookup);
      }

      return { ...prev, layers: { ...prev.layers, terrain } };
    });
  }

  function resetLevel() {
    setLevel(emptyLevel({
      columns: level.columns,
      durationSec: level.durationSec,
      fieldWidth: level.fieldWidth,
      scrollSpeed: level.scrollSpeed,
    }));
    setPendingClear(false);
  }

  function rebuildForColumns(columns: number) {
    setLevel(emptyLevel({
      columns,
      durationSec: level.durationSec,
      fieldWidth: level.fieldWidth,
      scrollSpeed: level.scrollSpeed,
    }));
    setPendingColumns(null);
    handleRef.current?.setLevelScrollZ(0);
  }

  function scrubTo(z: number) {
    setScrollZ(z);
    handleRef.current?.setLevelScrollZ(z);
  }

  function startScrub() {
    pausedBeforeScrub.current = paused;
    setPaused(true);
    handleRef.current?.setLevelScrollPaused(true);
  }

  function endScrub() {
    const nextPaused = pausedBeforeScrub.current;
    setPaused(nextPaused);
    handleRef.current?.setLevelScrollPaused(nextPaused);
  }

  return (
    <div className="lb-page">
      <canvas ref={canvasRef} className="lb-bg-canvas" />
      <div className="lb-preview-shade" />

      <aside className="lb-panel lb-panel-left">
        <LevelPanel
          level={level}
          saved={saved}
          fps={fps}
          onColumnsChange={(columns) => {
            if (columns !== level.columns) setPendingColumns(columns);
          }}
        />
        {pendingColumns != null && (
          <ColumnChangeConfirm
            columns={pendingColumns}
            onCancel={() => setPendingColumns(null)}
            onConfirm={() => rebuildForColumns(pendingColumns)}
          />
        )}
        <PaintPanel
          mode={mode}
          brushShape={brushShape}
          pendingClear={pendingClear}
          onModeChange={(m) => { setMode(m); setEraseActive(false); }}
          onBrushShapeChange={changeBrushShape}
          onRequestClear={() => setPendingClear(true)}
          onCancelClear={() => setPendingClear(false)}
          onConfirmClear={resetLevel}
        />
        <PalettePanel
          loaded={loaded}
          mode={mode}
          paletteSlots={paletteSlots}
          slotColor={slotColor}
          selectedTerrain={selectedTerrain}
          selectedObject={selectedObject}
          selectedHeight={selectedHeight}
          catalogLabelMap={catalogLabelMap}
          terrainBrushMode={terrainBrushMode}
          connectedFamily={connectedFamily}
          featureFamilies={featureFamilies}
          fallbackCount={fallbackCount}
          packForSlot={packForSlot}
          onModeChange={(m) => { setMode(m); setEraseActive(false); }}
          onTerrainSelect={setSelectedTerrain}
          onObjectSelect={setSelectedObject}
          onHeightSelect={setSelectedHeight}
          onTerrainBrushModeChange={setTerrainBrushMode}
          onConnectedFamilyChange={setConnectedFamily}
          onRebuildConnections={rebuildConnections}
          eraseActive={eraseActive}
          onEraseActiveChange={setEraseActive}
        />
      </aside>

      <aside className="lb-panel lb-panel-right">
        <PreviewPanel
          paused={paused}
          progressPct={progressPct}
          totalDepth={totalDepth}
          scrollZ={scrollZ}
          onPausedChange={setPaused}
          onScrubStart={startScrub}
          onScrub={scrubTo}
          onScrubEnd={endScrub}
        />
        <GridPanel
          mode={mode}
          level={level}
          cols={cols}
          currentGridRow={currentGridRow}
          slotColor={slotColor}
          rectPreview={rectPreview}
          onCellDown={handleCellDown}
          onCellEnter={handleCellEnter}
          onCellRightDown={handleCellRightDown}
          onGridUp={handleGridUp}
          onGridLeave={handleGridLeave}
        />
      </aside>
    </div>
  );
}
