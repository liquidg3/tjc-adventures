export type NormalizationPresetId = "none" | "kenney-space-kit" | "kenney-nature-kit";

export type NormalizationAnchor = "none" | "center" | "bottom-center";

export interface AssetNormalization {
  orient: [number, number, number];
  offset: [number, number, number];
  anchor: NormalizationAnchor;
  fitMargin: number;
}

export interface AssetAssignment {
  model: string;
  preset: NormalizationPresetId;
}

export type NormalizationPresetMap = Record<NormalizationPresetId, AssetNormalization>;
export interface AssetNormalizationOverride {
  orient?: [number, number, number];
  offset?: [number, number, number];
  anchor?: NormalizationAnchor;
  fitMargin?: number;
}

export type AssetNormalizationOverrideMap = Record<string, AssetNormalizationOverride>;

export const NORMALIZATION_PRESET_DEFS: Array<{
  id: NormalizationPresetId;
  label: string;
  normalization: AssetNormalization;
}> = [
  {
    id: "none",
    label: "None",
    normalization: { orient: [0, 0, 0], offset: [0, 0, 0], anchor: "center", fitMargin: 1.5 },
  },
  {
    id: "kenney-space-kit",
    label: "kenney-space-kit",
    normalization: { orient: [0, 90, 0], offset: [0, 0, 0], anchor: "center", fitMargin: 1.7 },
  },
  {
    id: "kenney-nature-kit",
    label: "kenney-nature-kit",
    normalization: { orient: [0, 0, 0], offset: [0, 0, 0], anchor: "bottom-center", fitMargin: 1.9 },
  },
];

export function getDefaultNormalizationPresets(): NormalizationPresetMap {
  return Object.fromEntries(
    NORMALIZATION_PRESET_DEFS.map((preset) => [preset.id, { ...preset.normalization }])
  ) as NormalizationPresetMap;
}

export function mergeNormalizationPresets(raw: unknown): NormalizationPresetMap {
  const defaults = getDefaultNormalizationPresets();
  if (!raw || typeof raw !== "object") return defaults;
  for (const preset of NORMALIZATION_PRESET_DEFS) {
    const value = (raw as Record<string, unknown>)[preset.id];
    if (!value || typeof value !== "object") continue;
    const obj = value as Partial<AssetNormalization> & { orient?: unknown; offset?: unknown };
    defaults[preset.id] = {
      orient: Array.isArray(obj.orient) && obj.orient.length === 3
        ? [num(obj.orient[0], preset.normalization.orient[0]), num(obj.orient[1], preset.normalization.orient[1]), num(obj.orient[2], preset.normalization.orient[2])]
        : preset.normalization.orient,
      offset: Array.isArray(obj.offset) && obj.offset.length === 3
        ? [num(obj.offset[0], preset.normalization.offset[0]), num(obj.offset[1], preset.normalization.offset[1]), num(obj.offset[2], preset.normalization.offset[2])]
        : preset.normalization.offset,
      anchor: isAnchor(obj.anchor) ? obj.anchor : preset.normalization.anchor,
      fitMargin: num(obj.fitMargin, preset.normalization.fitMargin),
    };
  }
  return defaults;
}

export function getNormalizationPreset(
  presets: NormalizationPresetMap,
  id: NormalizationPresetId
): AssetNormalization {
  return presets[id] ?? getDefaultNormalizationPresets().none;
}

export function mergeNormalizationOverrides(raw: unknown): AssetNormalizationOverrideMap {
  if (!raw || typeof raw !== "object") return {};
  const out: AssetNormalizationOverrideMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const obj = value as Partial<AssetNormalization> & { orient?: unknown; offset?: unknown };
    const next: AssetNormalizationOverride = {};
    if (Array.isArray(obj.orient) && obj.orient.length === 3) {
      next.orient = [num(obj.orient[0], 0), num(obj.orient[1], 0), num(obj.orient[2], 0)];
    }
    if (Array.isArray(obj.offset) && obj.offset.length === 3) {
      next.offset = [num(obj.offset[0], 0), num(obj.offset[1], 0), num(obj.offset[2], 0)];
    }
    if (isAnchor(obj.anchor)) next.anchor = obj.anchor;
    if (typeof obj.fitMargin === "number" && Number.isFinite(obj.fitMargin)) next.fitMargin = obj.fitMargin;
    if (Object.keys(next).length > 0) out[key] = next;
  }
  return out;
}

export function resolveAssetNormalization(
  preset: AssetNormalization,
  override?: AssetNormalizationOverride
): AssetNormalization {
  if (!override) return { ...preset, orient: [...preset.orient], offset: [...preset.offset] };
  return {
    orient: override.orient ? [...override.orient] : [...preset.orient],
    offset: override.offset ? [...override.offset] : [...preset.offset],
    anchor: override.anchor ?? preset.anchor,
    fitMargin: override.fitMargin ?? preset.fitMargin,
  };
}

export function diffAssetNormalization(
  preset: AssetNormalization,
  resolved: AssetNormalization
): AssetNormalizationOverride | null {
  const diff: AssetNormalizationOverride = {};
  if (!sameTuple(preset.orient, resolved.orient)) diff.orient = [...resolved.orient];
  if (!sameTuple(preset.offset, resolved.offset)) diff.offset = [...resolved.offset];
  if (preset.anchor !== resolved.anchor) diff.anchor = resolved.anchor;
  if (preset.fitMargin !== resolved.fitMargin) diff.fitMargin = resolved.fitMargin;
  return Object.keys(diff).length > 0 ? diff : null;
}

export function parseAssetAssignment(raw: unknown): AssetAssignment {
  if (typeof raw === "string") {
    return { model: raw, preset: suggestPresetForModel(raw) };
  }
  if (raw && typeof raw === "object") {
    const obj = raw as { model?: unknown; preset?: unknown };
    const model = typeof obj.model === "string" ? obj.model : "";
    const preset = isPresetId(obj.preset) ? obj.preset : suggestPresetForModel(model);
    return { model, preset };
  }
  return { model: "", preset: "none" };
}

export function parseAssetAssignments(raw: unknown): Record<string, AssetAssignment> {
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).map(([key, value]) => [key, parseAssetAssignment(value)])
  );
}

export function getAssignedModelValue(raw: unknown): string {
  return parseAssetAssignment(raw).model;
}

export function serializeAssetAssignments(assignments: Record<string, AssetAssignment>) {
  return Object.fromEntries(
    Object.entries(assignments).map(([key, value]) => [
      key,
      value.model ? { model: value.model, preset: value.preset } : "",
    ])
  );
}

export function suggestPresetForModel(modelValue: string): NormalizationPresetId {
  if (modelValue.startsWith("model:kenney-space-kit/")) return "kenney-space-kit";
  if (modelValue.startsWith("model:kenney-nature-kit/")) return "kenney-nature-kit";
  return "none";
}

function isPresetId(value: unknown): value is NormalizationPresetId {
  return NORMALIZATION_PRESET_DEFS.some((preset) => preset.id === value);
}

function isAnchor(value: unknown): value is NormalizationAnchor {
  return value === "none" || value === "center" || value === "bottom-center";
}

function num(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function sameTuple(a: [number, number, number], b: [number, number, number]) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}
