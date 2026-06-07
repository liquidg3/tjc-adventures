import { useMemo, useState } from "react";
import { MAX_HEIGHT, type TerrainFeatureFamily } from "./level-builder-state";
import { type PaintMode } from "./level-builder-types";

/** Strip the leading category prefix and split camelCase into title-cased words.
 *  ground_riverStraight → "River Straight"
 *  rock_largeA          → "Large A"
 */
export function formatModelLabel(name: string): string {
  const body = name.replace(/^[a-z]+_/, "");
  return body
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const HEIGHT_LEVELS = Array.from({ length: MAX_HEIGHT + 1 }, (_, i) => i);

const FAMILY_LABELS: Record<TerrainFeatureFamily, string> = {
  river: "River",
  path: "Path",
  road: "Road",
};

// ─── PalettePanel ─────────────────────────────────────────────────────────────

export interface PalettePanelProps {
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
  eraseActive: boolean;
  onModeChange: (mode: PaintMode) => void;
  onTerrainSelect: (id: string) => void;
  onObjectSelect: (id: string) => void;
  onHeightSelect: (height: number) => void;
  onTerrainBrushModeChange: (mode: "manual" | "connected") => void;
  onConnectedFamilyChange: (family: TerrainFeatureFamily) => void;
  onRebuildConnections: () => void;
  onEraseActiveChange: (active: boolean) => void;
}

export function PalettePanel({
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
  eraseActive,
  onModeChange,
  onTerrainSelect,
  onObjectSelect,
  onHeightSelect,
  onTerrainBrushModeChange,
  onConnectedFamilyChange,
  onRebuildConnections,
  onEraseActiveChange,
}: PalettePanelProps) {
  const [search, setSearch] = useState("");
  const [selectedKit, setSelectedKit] = useState<string>("all");

  const showList = mode !== "height" && !(mode === "terrain" && terrainBrushMode === "connected");

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
              <span
                className="lb-fallback-badge"
                title={`${fallbackCount} cell${fallbackCount !== 1 ? "s" : ""} using a fallback shape — missing models in the active kit`}
              >
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
