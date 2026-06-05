import { useEffect, useMemo, useState } from "react";
import {
  mergeNormalizationOverrides,
  getDefaultNormalizationPresets,
  mergeNormalizationPresets,
  type AssetNormalizationOverride,
  type AssetNormalizationOverrideMap,
  type NormalizationPresetMap,
  type NormalizationPresetId,
} from "./asset-normalization";
import type { AssetOption } from "./slots";
import { loadStagedModels } from "./models";
import type { ModelEntry } from "./models";
import {
  buildModelCatalog,
  EMPTY_MODEL_CATALOG_OVERRIDES,
  MODEL_CATEGORY_LABELS,
  MODEL_USAGE_LABELS,
  PACK_THEME_LABELS,
  parseModelCatalogOverrides,
  type ModelCatalogItem,
  type ModelCatalogOverride,
  type ModelCatalogOverrides,
  type ModelCategory,
  type PackTheme,
} from "./model-catalog";
import { SlotCard } from "./SlotCard";
import { usePersistedJson } from "./use-persisted-json";

// Built-in procedural placeholders are always available; the real options come
// from the packs you import in the Asset Library (public/models/).
const BUILTINS: AssetOption[] = [
  { value: "builtin:interceptor", label: "Interceptor (built-in)", variant: "interceptor" },
  { value: "builtin:hauler", label: "Hauler (built-in)", variant: "hauler" },
  { value: "builtin:scout", label: "Scout (built-in)", variant: "scout" },
];

const ASSET_NORMALIZATION_PRESETS_URL = "/__asset-normalization-presets";
const ASSET_NORMALIZATION_OVERRIDES_URL = "/__asset-normalization-overrides";
const MODEL_CATALOG_OVERRIDES_URL = "/__model-catalog-overrides";

/** The 3D Models section: curate imported models and tune normalization. */
export function ModelsBoard() {
  const [options, setOptions] = useState<AssetOption[]>(BUILTINS);
  const [modelEntries, setModelEntries] = useState<ModelEntry[]>([]);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogTheme, setCatalogTheme] = useState<"all" | PackTheme>("all");
  const [catalogCategory, setCatalogCategory] = useState<"all" | ModelCategory>("all");
  const [catalogKit, setCatalogKit] = useState("all");
  const [selectedCatalogValue, setSelectedCatalogValue] = useState("");
  const [selectedCatalogPreset, setSelectedCatalogPreset] = useState<NormalizationPresetId>("none");
  const presets = usePersistedJson<NormalizationPresetMap>(
    ASSET_NORMALIZATION_PRESETS_URL,
    getDefaultNormalizationPresets(),
    mergeNormalizationPresets,
  );
  const overrides = usePersistedJson<AssetNormalizationOverrideMap>(
    ASSET_NORMALIZATION_OVERRIDES_URL,
    {},
    mergeNormalizationOverrides,
  );
  const catalogOverrides = usePersistedJson<ModelCatalogOverrides>(
    MODEL_CATALOG_OVERRIDES_URL,
    EMPTY_MODEL_CATALOG_OVERRIDES,
    parseModelCatalogOverrides,
  );

  // model options come from the imported (staged) packs
  useEffect(() => {
    loadStagedModels().then((models) => {
      setModelEntries(models);
      setOptions([
        ...BUILTINS,
        ...models.map((m) => ({
          value: `model:${m.category}/${m.name}`,
          label: `${m.category}/${m.name}`,
          url: m.url,
          atlas: m.atlas,
        })),
      ]);
    });
  }, []);

  const catalog = useMemo(
    () => buildModelCatalog(modelEntries, catalogOverrides.value),
    [modelEntries, catalogOverrides.value],
  );

  useEffect(() => {
    setSelectedCatalogValue((current) => current || catalog[0]?.modelValue || "");
  }, [catalog]);

  const savePresetValues = (preset: NormalizationPresetId, nextValue: NormalizationPresetMap[NormalizationPresetId]) => {
    presets.setValue({ ...presets.value, [preset]: nextValue });
  };

  const saveOverrideValues = (modelValue: string, nextValue: AssetNormalizationOverride | null) => {
    const next = { ...overrides.value };
    if (nextValue) next[modelValue] = nextValue;
    else delete next[modelValue];
    overrides.setValue(next);
  };

  const saveCatalogOverride = (id: string, patch: ModelCatalogOverride) => {
    const curr = catalogOverrides.value.models[id] ?? {};
    const nextModel = {
      ...curr,
      ...patch,
      usage: patch.usage ? { ...(curr.usage ?? {}), ...patch.usage } : curr.usage,
    };
    catalogOverrides.setValue({
      schemaVersion: 1,
      models: {
        ...catalogOverrides.value.models,
        [id]: nextModel,
      },
    });
  };

  const modelCount = options.length - BUILTINS.length;
  const kits = useMemo(() => [...new Set(catalog.map((m) => m.packId))].sort(), [catalog]);
  const catalogNeedle = catalogQuery.trim().toLowerCase();
  const filteredCatalog = catalog.filter((m) =>
    (catalogTheme === "all" || m.theme === catalogTheme) &&
    (catalogCategory === "all" || m.categoryKind === catalogCategory) &&
    (catalogKit === "all" || m.packId === catalogKit) &&
    `${m.packName} ${m.name} ${m.family} ${m.shape}`.toLowerCase().includes(catalogNeedle),
  );

  return (
    <div className="studio">
      <header>
        <h1>3D Models</h1>
        <p>
          Curate imported Kenney models for builders and gameplay. Options come
          from packs imported in the <b>Asset Library</b> ({modelCount} models
          available). Tag where each model appears, then tune its center,
          forward direction, scale, and ground contact.
        </p>
      </header>
      <CatalogBrowser
        catalog={catalog}
        filteredCatalog={filteredCatalog}
        kits={kits}
        options={options}
        query={catalogQuery}
        theme={catalogTheme}
        category={catalogCategory}
        kit={catalogKit}
        selectedValue={selectedCatalogValue}
        selectedPreset={selectedCatalogPreset}
        saved={{
          presets: presets.saved,
          overrides: overrides.saved,
          catalog: catalogOverrides.saved,
        }}
        presetValues={presets.value}
        overrideValues={overrides.value}
        onQueryChange={setCatalogQuery}
        onThemeChange={setCatalogTheme}
        onCategoryChange={setCatalogCategory}
        onKitChange={setCatalogKit}
        onSelectedValueChange={setSelectedCatalogValue}
        onSelectedPresetChange={setSelectedCatalogPreset}
        onSavePreset={savePresetValues}
        onSaveOverride={saveOverrideValues}
        onCatalogOverride={saveCatalogOverride}
      />
    </div>
  );
}

function CatalogBrowser({
  catalog,
  filteredCatalog,
  kits,
  options,
  query,
  theme,
  category,
  kit,
  selectedValue,
  selectedPreset,
  saved,
  presetValues,
  overrideValues,
  onQueryChange,
  onThemeChange,
  onCategoryChange,
  onKitChange,
  onSelectedValueChange,
  onSelectedPresetChange,
  onSavePreset,
  onSaveOverride,
  onCatalogOverride,
}: {
  catalog: ModelCatalogItem[];
  filteredCatalog: ModelCatalogItem[];
  kits: string[];
  options: AssetOption[];
  query: string;
  theme: "all" | PackTheme;
  category: "all" | ModelCategory;
  kit: string;
  selectedValue: string;
  selectedPreset: NormalizationPresetId;
  saved: { presets: boolean; overrides: boolean; catalog: boolean };
  presetValues: NormalizationPresetMap;
  overrideValues: AssetNormalizationOverrideMap;
  onQueryChange: (value: string) => void;
  onThemeChange: (value: "all" | PackTheme) => void;
  onCategoryChange: (value: "all" | ModelCategory) => void;
  onKitChange: (value: string) => void;
  onSelectedValueChange: (value: string) => void;
  onSelectedPresetChange: (value: NormalizationPresetId) => void;
  onSavePreset: (preset: NormalizationPresetId, next: NormalizationPresetMap[NormalizationPresetId]) => void;
  onSaveOverride: (modelValue: string, next: AssetNormalizationOverride | null) => void;
  onCatalogOverride: (id: string, patch: ModelCatalogOverride) => void;
}) {
  const selected = catalog.find((m) => m.modelValue === selectedValue);

  return (
    <section>
      <h2>Imported Model Catalog</h2>
      <div className="summary">
        <b>{filteredCatalog.length}/{catalog.length}</b> models shown · inferred from imported pack manifests
        <span className="dim"> · presets {saved.presets ? "✓" : "…"}</span>
        <span className="dim"> · overrides {saved.overrides ? "✓" : "…"}</span>
        <span className="dim"> · catalog {saved.catalog ? "✓" : "…"}</span>
      </div>
      <div className="model-catalog-filters">
        <input
          className="studio-search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search imported models..."
        />
        <select value={theme} onChange={(e) => onThemeChange(e.target.value as "all" | PackTheme)}>
          <option value="all">All themes</option>
          {Object.entries(PACK_THEME_LABELS).map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
        <select value={category} onChange={(e) => onCategoryChange(e.target.value as "all" | ModelCategory)}>
          <option value="all">All categories</option>
          {Object.entries(MODEL_CATEGORY_LABELS).map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
        <select value={kit} onChange={(e) => onKitChange(e.target.value)}>
          <option value="all">All kits</option>
          {kits.map((packId) => (
            <option key={packId} value={packId}>{packId}</option>
          ))}
        </select>
      </div>

      <div className="model-catalog-layout">
        <div className="model-catalog-list">
          {filteredCatalog.map((model) => (
            <button
              type="button"
              key={model.id}
              className={`model-catalog-row ${selectedValue === model.modelValue ? "on" : ""}`}
              onClick={() => onSelectedValueChange(model.modelValue)}
            >
              <span>
                <b>{model.name}</b>
                <span className="dim">{model.packName}</span>
              </span>
              <span className="badge">{PACK_THEME_LABELS[model.theme]}</span>
              <span className="badge">{MODEL_CATEGORY_LABELS[model.categoryKind]}</span>
              {model.family && <span className="badge">{model.family}</span>}
              {model.shape && <span className="badge">{model.shape}</span>}
            </button>
          ))}
        </div>

        <div className="model-catalog-detail">
          {selected ? (
            <>
              <div className="card model-catalog-card">
                <div className="card-head">
                  <span className="card-title">{selected.name}</span>
                  <span className="badge">{selected.packName}</span>
                </div>
                <div className="model-catalog-tags">
                  <span className="badge">{PACK_THEME_LABELS[selected.theme]}</span>
                  <span className="badge">{MODEL_CATEGORY_LABELS[selected.categoryKind]}</span>
                  {selected.family && <span className="badge">{selected.family}</span>}
                  {selected.shape && <span className="badge">{selected.shape}</span>}
                </div>
                <div className="model-catalog-usage">
                  {MODEL_USAGE_LABELS.map(({ key, label }) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={selected.usage[key]}
                        onChange={(e) => onCatalogOverride(selected.id, { usage: { [key]: e.target.checked } })}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <SlotCard
                label="Catalog model normalization"
                value={selectedValue}
                preset={selectedPreset}
                presetValues={presetValues}
                overrideValues={overrideValues}
                options={options}
                onChange={onSelectedValueChange}
                onPresetChange={onSelectedPresetChange}
                onSavePreset={onSavePreset}
                onSaveOverride={onSaveOverride}
              />
            </>
          ) : (
            <div className="missing-box">No imported model selected.</div>
          )}
        </div>
      </div>
    </section>
  );
}
