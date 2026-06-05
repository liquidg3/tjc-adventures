import type { TerrainShape, ModelCatalogItem } from "./model-catalog";
import type { TerrainFeatureFamily } from "./level-builder-state";

export type TerrainModelLookup = Record<
  TerrainFeatureFamily,
  Partial<Record<TerrainShape, ModelCatalogItem[]>>
>;

const FEATURE_FAMILIES: ReadonlySet<string> = new Set(["river", "path", "road"]);

export function buildTerrainFeatureLookup(models: ModelCatalogItem[]): TerrainModelLookup {
  const lookup: TerrainModelLookup = { river: {}, path: {}, road: {} };
  for (const model of models) {
    if (!model.usage.showInLevelBuilder || !model.usage.terrain) continue;
    if (model.categoryKind !== "terrain") continue;
    if (!FEATURE_FAMILIES.has(model.family)) continue;
    if (!model.shape) continue;
    const family = model.family as TerrainFeatureFamily;
    const shape = model.shape;
    const existing = lookup[family][shape] ?? [];
    existing.push(model);
    lookup[family][shape] = existing;
  }
  return lookup;
}

export function resolveTerrainFeatureModel(
  lookup: TerrainModelLookup,
  family: TerrainFeatureFamily,
  shape: TerrainShape,
  activePackId?: string,
): ModelCatalogItem | null {
  const bucket = lookup[family]?.[shape];
  if (!bucket || bucket.length === 0) return null;
  if (bucket.length === 1) return bucket[0];
  // Stable tiebreaker: active pack → base name (ends exactly with _shape) → alphabetical.
  const scored = bucket
    .map((m) => ({ m, score: scoreModel(m, shape, activePackId) }))
    .sort((a, b) => b.score - a.score || a.m.name.localeCompare(b.m.name));
  return scored[0].m;
}

// Fallback chains per plan: when the exact shape is missing, try these in order.
const FALLBACK_CHAIN: Partial<Record<TerrainShape, TerrainShape[]>> = {
  cross: ["split"],
  split: ["cross", "straight"],
  end:   ["straight"],
  tile:  ["end", "straight"],
};

export function resolveTerrainFeatureFallback(
  lookup: TerrainModelLookup,
  family: TerrainFeatureFamily,
  shape: TerrainShape,
  activePackId?: string,
): { model: ModelCatalogItem; usedShape: TerrainShape } | null {
  const exact = resolveTerrainFeatureModel(lookup, family, shape, activePackId);
  if (exact) return { model: exact, usedShape: shape };
  for (const fallback of FALLBACK_CHAIN[shape] ?? []) {
    const model = resolveTerrainFeatureModel(lookup, family, fallback, activePackId);
    if (model) return { model, usedShape: fallback };
  }
  return null;
}

/** Returns which feature families have at least one resolvable shape in the lookup. */
export function availableFeatureFamilies(lookup: TerrainModelLookup): TerrainFeatureFamily[] {
  const all: TerrainFeatureFamily[] = ["river", "path", "road"];
  return all.filter((f) => Object.keys(lookup[f]).length > 0);
}

function scoreModel(
  model: ModelCatalogItem,
  shape: TerrainShape,
  activePackId?: string,
): number {
  let score = 0;
  if (activePackId && model.packId === activePackId) score += 4;
  const lower = model.name.toLowerCase();
  // Prefer base model whose name ends with exactly the shape (e.g. ground_riverCorner).
  // This naturally picks ground_riverCorner over ground_riverCornerSmall, ground_riverBend, etc.
  if (lower.endsWith(`_${shape}`) || lower === shape) score += 2;
  else if (lower.includes(shape)) score += 1;
  return score;
}
