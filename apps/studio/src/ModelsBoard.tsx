import { useEffect, useState } from "react";
import {
  mergeNormalizationOverrides,
  getDefaultNormalizationPresets,
  mergeNormalizationPresets,
  parseAssetAssignments,
  serializeAssetAssignments,
  suggestPresetForModel,
  type AssetNormalizationOverride,
  type AssetNormalizationOverrideMap,
  type AssetAssignment,
  type NormalizationPresetMap,
  type NormalizationPresetId,
} from "./asset-normalization";
import { SLOTS, type AssetOption } from "./slots";
import { loadStagedModels } from "./models";
import { SlotCard } from "./SlotCard";

// Built-in procedural placeholders are always available; the real options come
// from the packs you import in the Asset Library (public/models/).
const BUILTINS: AssetOption[] = [
  { value: "builtin:interceptor", label: "Interceptor (built-in)", variant: "interceptor" },
  { value: "builtin:hauler", label: "Hauler (built-in)", variant: "hauler" },
  { value: "builtin:scout", label: "Scout (built-in)", variant: "scout" },
];

// Assignments persist to a committed file (apps/studio/asset-map.json) via the
// dev server's /__asset-map endpoint — durable, in the repo, and readable by the
// game later. localStorage is just a fast offline fallback.
const ASSET_MAP_URL = "/__asset-map";
const ASSET_NORMALIZATION_PRESETS_URL = "/__asset-normalization-presets";
const ASSET_NORMALIZATION_OVERRIDES_URL = "/__asset-normalization-overrides";
const STORAGE_KEY = "tjc-asset-slots";

const loadLocal = (): Record<string, AssetAssignment> => {
  try {
    return parseAssetAssignments(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
  } catch {
    return {};
  }
};

/** The 3D Models section: assign a model to each game asset slot. */
export function ModelsBoard() {
  const [assign, setAssign] = useState<Record<string, AssetAssignment>>(loadLocal);
  const [presetValues, setPresetValuesState] = useState<NormalizationPresetMap>(getDefaultNormalizationPresets);
  const [overrideValues, setOverrideValuesState] = useState<AssetNormalizationOverrideMap>({});
  const [saved, setSaved] = useState(true);
  const [presetSaved, setPresetSaved] = useState(true);
  const [overrideSaved, setOverrideSaved] = useState(true);
  const [options, setOptions] = useState<AssetOption[]>(BUILTINS);

  // model options come from the imported (staged) packs
  useEffect(() => {
    loadStagedModels().then((models) =>
      setOptions([
        ...BUILTINS,
        ...models.map((m) => ({
          value: `model:${m.category}/${m.name}`,
          label: `${m.category}/${m.name}`,
          url: m.url,
          atlas: m.atlas,
        })),
      ]),
    );
  }, []);

  // load the durable file as the source of truth (falls back to localStorage)
  useEffect(() => {
    fetch(ASSET_MAP_URL)
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data === "object") setAssign(parseAssetAssignments(data));
      })
      .catch(() => {
        /* keep the localStorage fallback */
      });
  }, []);

  useEffect(() => {
    fetch(ASSET_NORMALIZATION_PRESETS_URL)
      .then((r) => r.json())
      .then((data) => setPresetValuesState(mergeNormalizationPresets(data)))
      .catch(() => {
        /* keep defaults */
      });
  }, []);

  useEffect(() => {
    fetch(ASSET_NORMALIZATION_OVERRIDES_URL)
      .then((r) => r.json())
      .then((data) => setOverrideValuesState(mergeNormalizationOverrides(data)))
      .catch(() => {
        /* keep empty overrides */
      });
  }, []);

  const persist = (next: Record<string, AssetAssignment>) => {
    const serialized = serializeAssetAssignments(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
    setSaved(false);
    fetch(ASSET_MAP_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(serialized, null, 2),
    })
      .then(() => setSaved(true))
      .catch(() => setSaved(false));
  };

  const persistPresetValues = (next: NormalizationPresetMap) => {
    setPresetValuesState(next);
    setPresetSaved(false);
    fetch(ASSET_NORMALIZATION_PRESETS_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next, null, 2),
    })
      .then(() => setPresetSaved(true))
      .catch(() => setPresetSaved(false));
  };

  const persistOverrideValues = (next: AssetNormalizationOverrideMap) => {
    setOverrideValuesState(next);
    setOverrideSaved(false);
    fetch(ASSET_NORMALIZATION_OVERRIDES_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next, null, 2),
    })
      .then(() => setOverrideSaved(true))
      .catch(() => setOverrideSaved(false));
  };

  const setModel = (id: string, value: string) =>
    setAssign((prev) => {
      const next = {
        ...prev,
        [id]: { model: value, preset: suggestPresetForModel(value) },
      };
      persist(next);
      return next;
    });

  const setPreset = (id: string, preset: NormalizationPresetId) =>
    setAssign((prev) => {
      const curr = prev[id] ?? { model: "", preset: "none" };
      const next = { ...prev, [id]: { ...curr, preset } };
      persist(next);
      return next;
    });

  const savePresetValues = (preset: NormalizationPresetId, nextValue: NormalizationPresetMap[NormalizationPresetId]) => {
    persistPresetValues({ ...presetValues, [preset]: nextValue });
  };

  const saveOverrideValues = (modelValue: string, nextValue: AssetNormalizationOverride | null) => {
    const next = { ...overrideValues };
    if (nextValue) next[modelValue] = nextValue;
    else delete next[modelValue];
    persistOverrideValues(next);
  };

  const allSlots = SLOTS.flatMap((c) => c.slots);
  const filled = allSlots.filter((s) => assign[s.id]?.model).length;
  const missing = allSlots.filter((s) => !assign[s.id]?.model).map((s) => s.label);
  const modelCount = options.length - BUILTINS.length;

  return (
    <div className="studio">
      <header>
        <h1>3D Models</h1>
        <p>
          Assign a model to each asset slot the game needs. Options come from the
          Kenney packs you import in the <b>Asset Library</b> ({modelCount} models
          available) — import more there and they appear here.
        </p>
        <div className="summary">
          <b>
            {filled}/{allSlots.length}
          </b>{" "}
          slots filled
          {missing.length > 0 && <span className="miss-list"> · still missing: {missing.join(", ")}</span>}
          <span className="dim">
            {" "}
            · saved to asset-map.json {saved ? "✓" : "…"}
          </span>
          <span className="dim">
            {" "}
            · presets {presetSaved ? "✓" : "…"}
          </span>
          <span className="dim">
            {" "}
            · overrides {overrideSaved ? "✓" : "…"}
          </span>
        </div>
      </header>

      {SLOTS.map((cat) => (
        <section key={cat.category}>
          <h2>{cat.category}</h2>
          <div className="grid">
            {cat.slots.map((s) => (
              <SlotCard
                key={s.id}
                label={s.label}
                value={assign[s.id]?.model || ""}
                preset={assign[s.id]?.preset || "none"}
                presetValues={presetValues}
                overrideValues={overrideValues}
                options={options}
                onChange={(v) => setModel(s.id, v)}
                onPresetChange={(preset) => setPreset(s.id, preset)}
                onSavePreset={savePresetValues}
                onSaveOverride={saveOverrideValues}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
