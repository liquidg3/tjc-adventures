import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  createShipScene,
  SCROLL,
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
  COLUMN_OPTIONS,
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
  MODEL_CATEGORY_LABELS,
  parseModelCatalogOverrides,
  type ModelCatalogItem,
  type ModelCatalogOverrides,
} from "./model-catalog";
import { usePersistedJson } from "./use-persisted-json";

const LEVEL_URL = "/__level-builder";
const ASSET_MAP_URL = "/__asset-map";
const MODEL_CATALOG_OVERRIDES_URL = "/__model-catalog-overrides";

type PaintMode = "terrain" | "object" | "height";

const PAINT_MODES: Array<{ id: PaintMode; label: string }> = [
  { id: "terrain", label: "Terrain" },
  { id: "object", label: "Objects" },
  { id: "height", label: "Height" },
];

const HEIGHT_LEVELS = Array.from({ length: MAX_HEIGHT + 1 }, (_, i) => i);

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
    const i = cellIndex(level, col, row);
    if (i < 0) return;
    if (eraseActive) { eraseCell(col, row); return; }
    if (mode === "terrain") {
      if (terrainBrushMode === "connected") paintConnectedFeature(col, row);
      else paintTerrainManual(col, row, isInitialDown);
    } else if (mode === "object") paintObject(col, row);
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

  function rotateCellTerrain(col: number, row: number) {
    setLevel((prev) => {
      const i = cellIndex(prev, col, row);
      if (i < 0) return prev;
      const existing = prev.layers.terrain[i];
      if (!existing?.terrain) return prev;
      const terrain = [...prev.layers.terrain];
      if (existing.feature) {
        const nextRotation = (((existing.feature.rotation ?? 0) + 90) % 360) as TerrainRotation;
        terrain[i] = { ...existing, feature: { ...existing.feature, rotation: nextRotation, manual: true } };
      } else {
        const nextRotation = (((existing.rotation ?? 0) + 90) % 360) as TerrainRotation;
        terrain[i] = { ...existing, rotation: nextRotation };
      }
      return { ...prev, layers: { ...prev.layers, terrain } };
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

  function paintObject(col: number, row: number) {
    if (!selectedObject) return;
    setLevel((prev) => {
      const i = cellIndex(prev, col, row);
      if (i < 0 || prev.layers.objects[i]?.objects?.[0]?.slot === selectedObject) return prev;
      const objects = [...prev.layers.objects];
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

  function handleCellDown(col: number, row: number) {
    pointerDown.current = true;
    if (brushShape === "rect") {
      rectAnchorRef.current = { col, row };
      setRectPreview({ minCol: col, maxCol: col, minRow: row, maxRow: row });
    } else {
      paintCell(col, row, true);
    }
  }

  function handleCellRightDown(col: number, row: number) {
    rotateCellTerrain(col, row);
  }

  function handleCellEnter(col: number, row: number) {
    if (!pointerDown.current) return;
    if (brushShape === "rect" && rectAnchorRef.current) {
      const a = rectAnchorRef.current;
      setRectPreview({
        minCol: Math.min(a.col, col), maxCol: Math.max(a.col, col),
        minRow: Math.min(a.row, row), maxRow: Math.max(a.row, row),
      });
    } else if (brushShape === "free") {
      paintCell(col, row);
    }
  }

  function handleGridUp() {
    if (brushShape === "rect" && pointerDown.current && rectPreview) {
      commitRect(rectPreview);
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

function LevelPanel({
  level,
  saved,
  fps,
  onColumnsChange,
}: {
  level: Level;
  saved: boolean;
  fps: number;
  onColumnsChange: (columns: number) => void;
}) {
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
    </section>
  );
}

function ColumnChangeConfirm({
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

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <b>{label}</b>
      <span>{value}</span>
    </div>
  );
}

function PaintPanel({
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
        <select value={brushShape} onChange={(e) => onBrushShapeChange(e.target.value as "free" | "rect")}
          title="Free = paint while dragging · Rect = drag to fill rectangle">
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

/** Strip the leading category prefix and split camelCase into title-cased words.
 *  ground_riverStraight → "River Straight"
 *  rock_largeA          → "Large A"
 *  path_woodCorner      → "Wood Corner"
 */
function formatModelLabel(name: string): string {
  const body = name.replace(/^[a-z]+_/, ""); // strip first prefix segment
  return body
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // split camelCase
    .replace(/_/g, " ")                       // remaining underscores → spaces
    .replace(/\b\w/g, (c) => c.toUpperCase()); // title case
}

const FAMILY_LABELS: Record<TerrainFeatureFamily, string> = {
  river: "River",
  path: "Path",
  road: "Road",
};

function PalettePanel({
  loaded,
  mode,
  paletteSlots,
  slotColor,
  selectedTerrain,
  selectedObject,
  selectedHeight,
  catalogLabelMap,
  terrainBrushMode,
  connectedFamily,
  featureFamilies,
  fallbackCount,
  packForSlot,
  onModeChange,
  onTerrainSelect,
  onObjectSelect,
  onHeightSelect,
  onTerrainBrushModeChange,
  onConnectedFamilyChange,
  onRebuildConnections,
  eraseActive,
  onEraseActiveChange,
}: {
  loaded: boolean;
  mode: PaintMode;
  paletteSlots: string[];
  slotColor: Record<string, string>;
  selectedTerrain: string;
  selectedObject: string;
  selectedHeight: number;
  catalogLabelMap: Record<string, string>;
  terrainBrushMode: "manual" | "connected";
  connectedFamily: TerrainFeatureFamily;
  featureFamilies: TerrainFeatureFamily[];
  fallbackCount: number;
  packForSlot: Record<string, string>;
  onModeChange: (mode: PaintMode) => void;
  onTerrainSelect: (id: string) => void;
  onObjectSelect: (id: string) => void;
  onHeightSelect: (height: number) => void;
  onTerrainBrushModeChange: (mode: "manual" | "connected") => void;
  onConnectedFamilyChange: (family: TerrainFeatureFamily) => void;
  onRebuildConnections: () => void;
  eraseActive: boolean;
  onEraseActiveChange: (active: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedKit, setSelectedKit] = useState<string>("all");

  const showList = mode !== "height" && !(mode === "terrain" && terrainBrushMode === "connected");

  // Kits that have at least one item in the current palette
  const availableKits = useMemo(() => {
    const names = new Set(paletteSlots.map((id) => packForSlot[id]).filter(Boolean));
    return [...names].sort();
  }, [paletteSlots, packForSlot]);

  const filteredSlots = useMemo(() => {
    if (!showList) return paletteSlots;
    let slots = paletteSlots;
    if (selectedKit !== "all") slots = slots.filter((id) => packForSlot[id] === selectedKit);
    if (search.trim()) {
      const q = search.toLowerCase();
      slots = slots.filter((id) => (catalogLabelMap[id] ?? id).toLowerCase().includes(q));
    }
    return slots;
  }, [showList, paletteSlots, selectedKit, search, packForSlot, catalogLabelMap]);

  return (
    <section className="lb-palette lb-section">
      <h2>Palette</h2>
      {!loaded && <p className="dim">Loading…</p>}

      {loaded && mode === "terrain" && (
        <div className="lb-tool-group lb-brush-mode">
          <span className="lb-tool-label">Brush</span>
          <button
            className={terrainBrushMode === "manual" ? "on" : ""}
            onClick={() => onTerrainBrushModeChange("manual")}
          >
            Manual
          </button>
          <button
            className={terrainBrushMode === "connected" ? "on" : ""}
            onClick={() => onTerrainBrushModeChange("connected")}
            disabled={featureFamilies.length === 0}
            title={featureFamilies.length === 0 ? "No connected terrain models curated yet" : undefined}
          >
            Connected
          </button>
        </div>
      )}

      {loaded && mode === "terrain" && terrainBrushMode === "connected" && (
        <>
          <div className="lb-tool-group lb-family-group">
            <span className="lb-tool-label">Family</span>
            {featureFamilies.map((f) => (
              <button
                key={f}
                className={connectedFamily === f ? "on" : ""}
                onClick={() => onConnectedFamilyChange(f)}
              >
                {FAMILY_LABELS[f]}
              </button>
            ))}
            {featureFamilies.length === 0 && (
              <p className="dim">No connected families curated. Go to <b>3D Models</b>.</p>
            )}
          </div>
          <div className="lb-rebuild-row">
            <button className="btn-sm lb-rebuild-btn" onClick={onRebuildConnections}>
              Rebuild Connections
            </button>
            {fallbackCount > 0 && (
              <span className="lb-fallback-badge" title={`${fallbackCount} cell${fallbackCount !== 1 ? "s" : ""} using a fallback shape — missing models in the active kit`}>
                {fallbackCount} fallback{fallbackCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </>
      )}

      {loaded && mode === "height" && (
        <div className="lb-height-palette">
          {HEIGHT_LEVELS.map((h) => (
            <button
              key={h}
              className={`lb-height-swatch ${selectedHeight === h ? "on" : ""}`}
              onClick={() => {
                onModeChange("height");
                onHeightSelect(h);
                onEraseActiveChange(false);
              }}
              style={{ opacity: 0.2 + (h / MAX_HEIGHT) * 0.8 }}
            >
              {h}
            </button>
          ))}
        </div>
      )}

      {loaded && (
        <button
          className={`lb-palette-item lb-eraser-item ${eraseActive ? "on" : ""}`}
          onClick={() => onEraseActiveChange(!eraseActive)}
          title="Erase this layer's paint. Right-click any cell to rotate it."
        >
          <span className="lb-swatch lb-swatch-eraser" />
          Eraser
        </button>
      )}

      {loaded && showList && paletteSlots.length === 0 && (
        <p className="dim">No matching curated models yet. Go to <b>3D Models</b> first.</p>
      )}

      {showList && (
        <>
          {availableKits.length > 1 && (
            <select
              className="lb-kit-select"
              value={selectedKit}
              onChange={(e) => setSelectedKit(e.target.value)}
            >
              <option value="all">All kits</option>
              {availableKits.map((kit) => (
                <option key={kit} value={kit}>{kit}</option>
              ))}
            </select>
          )}
          {paletteSlots.length > 6 && (
            <input
              className="lb-palette-search"
              type="search"
              placeholder="Search palette…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
          <div className="lb-palette-list">
            {filteredSlots.length === 0 && search.trim() && (
              <p className="dim">No matches for "{search}"</p>
            )}
            {filteredSlots.map((id) => {
              const selected = mode === "terrain" ? selectedTerrain === id : selectedObject === id;
              return (
                <button
                  key={id}
                  className={`lb-palette-item ${selected ? "on" : ""}`}
                  onClick={() => {
                    onEraseActiveChange(false);
                    if (mode === "terrain") {
                      onModeChange("terrain");
                      onTerrainSelect(id);
                    } else {
                      onModeChange("object");
                      onObjectSelect(id);
                    }
                  }}
                  title={id}
                >
                  <span className="lb-swatch" style={{ background: slotColor[id] }} />
                  {catalogLabelMap[id] ?? id}
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function PreviewPanel({
  paused,
  progressPct,
  totalDepth,
  scrollZ,
  onPausedChange,
  onScrubStart,
  onScrub,
  onScrubEnd,
}: {
  paused: boolean;
  progressPct: number;
  totalDepth: number;
  scrollZ: number;
  onPausedChange: (paused: boolean) => void;
  onScrubStart: () => void;
  onScrub: (z: number) => void;
  onScrubEnd: () => void;
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
    </section>
  );
}

// Row height must match --lb-cell-h in styles.css.
const VIRTUAL_ROW_H = 20;
const VIRTUAL_OVERSCAN = 4;

function GridPanel({
  mode,
  level,
  cols,
  currentGridRow,
  slotColor,
  rectPreview,
  onCellDown,
  onCellEnter,
  onCellRightDown,
  onGridUp,
  onGridLeave,
}: {
  mode: PaintMode;
  level: Level;
  cols: number[];
  currentGridRow: number;
  slotColor: Record<string, string>;
  rectPreview: { minCol: number; maxCol: number; minRow: number; maxRow: number } | null;
  onCellDown: (col: number, row: number) => void;
  onCellEnter: (col: number, row: number) => void;
  onCellRightDown: (col: number, row: number) => void;
  onGridUp: () => void;
  onGridLeave: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [firstRow, setFirstRow] = useState(0);
  const [lastRow, setLastRow] = useState(60);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    function update() {
      const el = wrapRef.current;
      if (!el) return;
      const first = Math.max(0, Math.floor(el.scrollTop / VIRTUAL_ROW_H) - VIRTUAL_OVERSCAN);
      const last = Math.min(level.rows, Math.ceil((el.scrollTop + el.clientHeight) / VIRTUAL_ROW_H) + VIRTUAL_OVERSCAN);
      setFirstRow(first);
      setLastRow(last);
    }

    update();
    wrap.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    return () => { wrap.removeEventListener("scroll", update); ro.disconnect(); };
  }, [level.rows]);

  const totalH = level.rows * VIRTUAL_ROW_H;
  const offsetTop = firstRow * VIRTUAL_ROW_H;
  const templateCols = `var(--lb-row-gutter) repeat(${level.columns}, minmax(0, 1fr))`;

  return (
    <section className="lb-section lb-grid-section">
      <div className="lb-grid-title">
        <h2>Grid</h2>
        <span className="dim">{level.columns}×{level.rows}</span>
      </div>
      <div ref={wrapRef} className="lb-grid-wrap">
        {/* Full-height spacer so the scrollbar reflects the total level height */}
        <div style={{ height: totalH, position: "relative" }}>
          {/* Only the visible window of rows, absolutely positioned */}
          <div
            className="lb-grid"
            style={{
              position: "absolute",
              top: offsetTop,
              left: 0,
              right: 0,
              gridTemplateColumns: templateCols,
            }}
            onPointerUp={onGridUp}
            onPointerLeave={onGridLeave}
          >
            {Array.from({ length: lastRow - firstRow }, (_, i) => firstRow + i).map((row) => (
              <Fragment key={`row-${row}`}>
                <div className={`lb-row-gutter${row === currentGridRow ? " lb-row-gutter-current" : ""}`}>
                  {row === currentGridRow ? "▲" : level.rows - row}
                </div>
                {cols.map((col) => (
                  <GridCell
                    key={`${col}-${row}`}
                    col={col}
                    row={row}
                    mode={mode}
                    level={level}
                    current={row === currentGridRow}
                    slotColor={slotColor}
                    inRectPreview={rectPreview != null && col >= rectPreview.minCol && col <= rectPreview.maxCol && row >= rectPreview.minRow && row <= rectPreview.maxRow}
                    onCellDown={onCellDown}
                    onCellEnter={onCellEnter}
                    onCellRightDown={onCellRightDown}
                  />
                ))}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function GridCell({
  col,
  row,
  mode,
  level,
  current,
  slotColor,
  inRectPreview,
  onCellDown,
  onCellEnter,
  onCellRightDown,
}: {
  col: number;
  row: number;
  mode: PaintMode;
  level: Level;
  current: boolean;
  slotColor: Record<string, string>;
  inRectPreview: boolean;
  onCellDown: (col: number, row: number) => void;
  onCellEnter: (col: number, row: number) => void;
  onCellRightDown: (col: number, row: number) => void;
}) {
  const i = cellIndex(level, col, row);
  const terrainCell = level.layers.terrain[i];
  const terrain = terrainCell?.terrain;
  const object = level.layers.objects[i]?.objects?.[0]?.slot;
  const height = level.layers.height[i]?.height ?? 0;
  const background = cellBackgroundForMode(mode, terrain, object, height, slotColor);

  let cls = `lb-cell lb-cell-${mode}`;
  if (current) cls += " lb-cell-current-row";
  if (inRectPreview) cls += " lb-cell-rect-preview";
  else if (terrainCell?.feature) cls += terrainCell.feature.fallback ? " lb-cell-feature-fallback" : " lb-cell-feature";

  return (
    <button
      className={cls}
      type="button"
      style={{ background }}
      title={cellTitle(col, row, terrainCell, object, height)}
      onPointerDown={(e) => {
        if (e.button === 2) { e.preventDefault(); onCellRightDown(col, row); return; }
        if (e.button !== 0) return;
        e.preventDefault();
        onCellDown(col, row);
      }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerEnter={() => onCellEnter(col, row)}
    >
      {mode === "object" && object && <span className="lb-object-dot" />}
      {mode === "terrain" && object && <span className="lb-object-ghost" />}
    </button>
  );
}


function formatTime(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

function cellBackgroundForMode(
  mode: PaintMode,
  terrain: string | undefined,
  object: string | undefined,
  height: number,
  slotColor: Record<string, string>,
): string | undefined {
  if (mode === "terrain") return terrain ? slotColor[terrain] ?? "var(--ui-color-selection)" : undefined;
  if (mode === "object") return object ? slotColor[object] ?? "var(--ui-color-warning)" : undefined;
  if (mode === "height") return height ? heightColor(height) : undefined;
  if (object) return slotColor[object] ?? "var(--ui-color-warning)";
  if (terrain) return slotColor[terrain] ?? "var(--ui-color-selection)";
  return height ? heightColor(height, 0.72) : undefined;
}

function heightColor(height: number, maxAlpha = 0.88): string {
  const alpha = 0.12 + (height / MAX_HEIGHT) * maxAlpha;
  return `rgba(0,0,0,${alpha})`;
}

function cellTitle(
  col: number,
  row: number,
  cell: import("./level-builder-state").TerrainCell | undefined,
  object: string | undefined,
  height: number,
): string {
  const parts = [`[${col},${row}]`];
  if (cell?.feature) {
    const f = cell.feature;
    parts.push(`${f.family} ${f.shape} ${f.rotation}°${f.manual ? " [manual]" : ""}`);
  } else if (cell?.terrain) {
    parts.push(`terrain=${cell.terrain}`);
  }
  if (object) parts.push(`object=${object}`);
  if (height) parts.push(`h=${height}`);
  return parts.join(" · ");
}
