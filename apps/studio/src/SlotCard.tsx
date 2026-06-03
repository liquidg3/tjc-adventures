import { useEffect, useState } from "react";
import { ModelPreview } from "./ModelPreview";
import {
  NORMALIZATION_PRESET_DEFS,
  diffAssetNormalization,
  getNormalizationPreset,
  resolveAssetNormalization,
  type AssetNormalization,
  type AssetNormalizationOverride,
  type AssetNormalizationOverrideMap,
  type NormalizationAnchor,
  type NormalizationPresetId,
  type NormalizationPresetMap,
} from "./asset-normalization";
import type { AssetOption } from "./slots";

export function SlotCard({
  label,
  value,
  preset,
  presetValues,
  overrideValues,
  options,
  onChange,
  onPresetChange,
  onSavePreset,
  onSaveOverride,
}: {
  label: string;
  value: string;
  preset: NormalizationPresetId;
  presetValues: NormalizationPresetMap;
  overrideValues: AssetNormalizationOverrideMap;
  options: AssetOption[];
  onChange: (value: string) => void;
  onPresetChange: (preset: NormalizationPresetId) => void;
  onSavePreset: (preset: NormalizationPresetId, next: AssetNormalization) => void;
  onSaveOverride: (modelValue: string, next: AssetNormalizationOverride | null) => void;
}) {
  const selected = options.find((o) => o.value === value);
  const assigned = Boolean(selected);
  const basePreset = getNormalizationPreset(presetValues, preset);
  const modelOverride = value ? overrideValues[value] : undefined;
  const resolved = resolveAssetNormalization(basePreset, modelOverride);
  const [draft, setDraft] = useState<AssetNormalization>(resolved);
  const [pendingAction, setPendingAction] = useState<null | "save-preset" | "save-model" | "clear-model">(null);

  useEffect(() => {
    setDraft(resolved);
    setPendingAction(null);
  }, [preset, presetValues, overrideValues, value]);

  const dirty =
    draft.anchor !== resolved.anchor ||
    draft.fitMargin !== resolved.fitMargin ||
    draft.orient.some((v, i) => v !== resolved.orient[i]) ||
    draft.offset.some((v, i) => v !== resolved.offset[i]);

  const updateOrient = (index: number, next: number) => {
    const orient = [...draft.orient] as [number, number, number];
    orient[index] = next;
    setDraft({ ...draft, orient });
  };

  const updateOffset = (index: number, next: number) => {
    const offset = [...draft.offset] as [number, number, number];
    offset[index] = next;
    setDraft({ ...draft, offset });
  };

  const confirmAction = () => {
    if (pendingAction === "save-preset") onSavePreset(preset, draft);
    if (pendingAction === "save-model" && value) onSaveOverride(value, diffAssetNormalization(basePreset, draft));
    if (pendingAction === "clear-model" && value) onSaveOverride(value, null);
    setPendingAction(null);
  };

  const pendingText =
    pendingAction === "save-preset"
      ? `Apply these values to every model using "${preset}"?`
      : pendingAction === "save-model"
        ? `Save these values as an override for "${value}" only?`
        : pendingAction === "clear-model"
          ? `Remove the model-specific override for "${value}"?`
          : "";

  const presetEditor =
    assigned && preset !== "none" ? (
      <div className="preset-editor">
        <div className="preset-editor-title">Preset Tuning</div>
        {(["x", "y", "z"] as const).map((axis, index) => (
          <label key={axis} className="preset-ctl">
            <span>{axis.toUpperCase()}</span>
            <input
              type="range"
              min={-180}
              max={180}
              step={5}
              value={draft.orient[index]}
              onChange={(e) => updateOrient(index, parseInt(e.target.value, 10))}
            />
            <input
              className="preset-num"
              type="number"
              min={-180}
              max={180}
              step={1}
              value={draft.orient[index]}
              onChange={(e) => updateOrient(index, Number(e.target.value))}
            />
          </label>
        ))}
        {(["x", "y", "z"] as const).map((axis, index) => (
          <label key={`offset-${axis}`} className="preset-ctl">
            <span>{axis.toUpperCase()} offset</span>
            <input
              type="range"
              min={-5}
              max={5}
              step={0.05}
              value={draft.offset[index]}
              onChange={(e) => updateOffset(index, parseFloat(e.target.value))}
            />
            <input
              className="preset-num"
              type="number"
              min={-5}
              max={5}
              step={0.05}
              value={draft.offset[index]}
              onChange={(e) => updateOffset(index, Number(e.target.value))}
            />
          </label>
        ))}
        <label className="preset-ctl preset-select">
          <span>Anchor</span>
          <select value={draft.anchor} onChange={(e) => setDraft({ ...draft, anchor: e.target.value as NormalizationAnchor })}>
            <option value="none">None</option>
            <option value="center">Center</option>
            <option value="bottom-center">Bottom center</option>
          </select>
        </label>
        <label className="preset-ctl">
          <span>Fit</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={draft.fitMargin}
            onChange={(e) => setDraft({ ...draft, fitMargin: parseFloat(e.target.value) })}
          />
          <input
            className="preset-num"
            type="number"
            min={1}
            max={3}
            step={0.05}
            value={draft.fitMargin}
            onChange={(e) => setDraft({ ...draft, fitMargin: Number(e.target.value) })}
          />
        </label>
        <div className={`draft-state ${dirty ? "dirty" : "saved"}`}>
          {dirty ? "Draft has unsaved changes" : "Draft matches saved values"}
        </div>
        <button className="panel-save" onClick={() => setDraft(resolved)} disabled={!dirty}>
          Reset Draft
        </button>
        <button className="panel-save" onClick={() => setPendingAction("save-preset")}>
          Save Preset
        </button>
        <button className="panel-save" onClick={() => setPendingAction("save-model")}>
          Save For Model
        </button>
        {modelOverride && (
          <button className="panel-save" onClick={() => setPendingAction("clear-model")}>
            Clear Model Override
          </button>
        )}
        {pendingAction && (
          <div className="confirm-box">
            <div className="confirm-title">Confirm Change</div>
            <p>{pendingText}</p>
            <div className="confirm-actions">
              <button className="panel-save" onClick={() => setPendingAction(null)}>
                Cancel
              </button>
              <button className="panel-save confirm-accept" onClick={confirmAction}>
                Confirm
              </button>
            </div>
          </div>
        )}
      </div>
    ) : null;

  return (
    <div className={`card slot ${assigned ? "" : "is-missing"}`}>
      <div className="card-head">
        <span className="card-title">{label}</span>
        <span className={assigned ? "badge ok" : "badge error"}>{assigned ? "✓ set" : "missing"}</span>
      </div>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— choose a model —</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {assigned && (
        <select value={preset} onChange={(e) => onPresetChange(e.target.value as NormalizationPresetId)}>
          {NORMALIZATION_PRESET_DEFS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      )}
      {assigned ? (
        <ModelPreview
          modelUrl={selected!.url}
          atlasUrl={selected!.atlas}
          variant={selected!.variant}
          normalizationPreset={preset}
          normalizationPresets={presetValues}
          normalizationResolved={draft}
          overlayContent={presetEditor}
        />
      ) : (
        <div className="missing-box">no model yet</div>
      )}
    </div>
  );
}
