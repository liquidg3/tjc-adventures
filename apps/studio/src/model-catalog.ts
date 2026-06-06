import type { ModelEntry } from "./models";

export type KenneyKind = "3d" | "ui";

export type PackTheme =
  | "nature"
  | "space"
  | "city"
  | "dungeon"
  | "fantasy"
  | "pirate"
  | "transport"
  | "farm"
  | "animals"
  | "ui"
  | "other";

export type ModelCategory =
  | "terrain"
  | "nature"
  | "animals"
  | "ships"
  | "buildings"
  | "props"
  | "gameplay"
  | "unknown";

export type TerrainShape =
  | "straight"
  | "corner"
  | "end"
  | "split"
  | "cross"
  | "tile";

export interface KenneyPack {
  slug: string;
  name: string;
  kind: KenneyKind;
}

export interface PackCatalogItem extends KenneyPack {
  packId: string;
  imported: boolean;
  theme: PackTheme;
}

export interface ModelUsage {
  showInLevelBuilder: boolean;
  terrain: boolean;
  object: boolean;
  rescueAnimal: boolean;
  goodGuyShip: boolean;
  badGuyShip: boolean;
  obstacle: boolean;
  landmark: boolean;
}

export interface ModelCatalogItem extends ModelEntry {
  id: string;
  modelValue: string;
  packId: string;
  packName: string;
  theme: PackTheme;
  categoryKind: ModelCategory;
  family: string;
  shape: TerrainShape | "";
  usage: ModelUsage;
}

export interface ModelCatalogOverride {
  categoryKind?: ModelCategory;
  family?: string;
  shape?: TerrainShape | "";
  usage?: Partial<ModelUsage>;
}

export interface ModelCatalogOverrides {
  schemaVersion: 1;
  models: Record<string, ModelCatalogOverride>;
}

export const EMPTY_MODEL_CATALOG_OVERRIDES: ModelCatalogOverrides = {
  schemaVersion: 1,
  models: {},
};

export const PACK_THEME_LABELS: Record<PackTheme, string> = {
  nature: "Nature",
  space: "Space",
  city: "City",
  dungeon: "Dungeon",
  fantasy: "Fantasy",
  pirate: "Pirate",
  transport: "Transport",
  farm: "Farm",
  animals: "Animals",
  ui: "UI",
  other: "Other",
};

export const MODEL_CATEGORY_LABELS: Record<ModelCategory, string> = {
  terrain: "Terrain",
  nature: "Nature",
  animals: "Animals",
  ships: "Ships",
  buildings: "Buildings",
  props: "Props",
  gameplay: "Gameplay",
  unknown: "Unknown",
};

export const MODEL_USAGE_LABELS: Array<{ key: keyof ModelUsage; label: string }> = [
  { key: "showInLevelBuilder", label: "Level Builder" },
  { key: "terrain", label: "Terrain" },
  { key: "object", label: "Object" },
  { key: "rescueAnimal", label: "Rescue" },
  { key: "goodGuyShip", label: "Good ship" },
  { key: "badGuyShip", label: "Bad ship" },
  { key: "obstacle", label: "Obstacle" },
  { key: "landmark", label: "Landmark" },
];

export function parseModelCatalogOverrides(raw: unknown): ModelCatalogOverrides {
  if (!raw || typeof raw !== "object") return EMPTY_MODEL_CATALOG_OVERRIDES;
  const data = raw as Partial<ModelCatalogOverrides>;
  const out: ModelCatalogOverrides = { schemaVersion: 1, models: {} };
  const models = data.models;
  if (!models || typeof models !== "object") return out;
  for (const [id, value] of Object.entries(models)) {
    if (!value || typeof value !== "object") continue;
    const override = value as ModelCatalogOverride;
    out.models[id] = {
      categoryKind: isModelCategory(override.categoryKind) ? override.categoryKind : undefined,
      family: typeof override.family === "string" ? override.family : undefined,
      shape: isTerrainShape(override.shape) || override.shape === "" ? override.shape : undefined,
      usage: parseUsageOverride(override.usage),
    };
  }
  return out;
}

export function inferPackTheme(pack: Pick<KenneyPack, "slug" | "name" | "kind">): PackTheme {
  if (pack.kind === "ui") return "ui";
  const text = `${pack.slug} ${pack.name}`.toLowerCase();
  if (/(nature|foliage|plant|forest|tree|grass)/.test(text)) return "nature";
  if (/(space|sci-fi|scifi|alien|ufo|station|shooter)/.test(text)) return "space";
  if (/(city|urban|road|building|market)/.test(text)) return "city";
  if (/(dungeon|graveyard|cave|roguelike)/.test(text)) return "dungeon";
  if (/(fantasy|medieval|castle|rpg)/.test(text)) return "fantasy";
  if (/(pirate|watercraft)/.test(text)) return "pirate";
  if (/(car|racing|train|transport|vehicle|coaster)/.test(text)) return "transport";
  if (/(farm|food|furniture)/.test(text)) return "farm";
  if (/(animal|pet|character|cube-pets|toon|survivor|protagonist)/.test(text)) return "animals";
  return "other";
}

export function packIdFromSlug(slug: string): string {
  return slug.startsWith("kenney-") ? slug : `kenney-${slug}`;
}

export function buildPackCatalog(
  packs: KenneyPack[],
  importedPackIds: Set<string>,
): PackCatalogItem[] {
  return packs.map((pack) => ({
    ...pack,
    packId: packIdFromSlug(pack.slug),
    imported: importedPackIds.has(packIdFromSlug(pack.slug)),
    theme: inferPackTheme(pack),
  }));
}

export function buildModelCatalog(
  models: ModelEntry[],
  overrides: ModelCatalogOverrides,
): ModelCatalogItem[] {
  return models.map((model) => {
    const packId = model.category;
    const id = `${packId}/${model.name}`;
    const inferred = inferModel(model.name, packId);
    const override = overrides.models[id] ?? {};
    const categoryKind = override.categoryKind ?? inferred.categoryKind;
    const family = override.family ?? inferred.family;
    const shape = override.shape ?? inferred.shape;
    return {
      ...model,
      id,
      modelValue: modelValueFromId(id),
      packId,
      packName: packTitleFromId(packId),
      theme: inferPackTheme({ slug: packId.replace(/^kenney-/, ""), name: packTitleFromId(packId), kind: "3d" }),
      categoryKind,
      family,
      shape,
      usage: {
        ...defaultUsage(categoryKind, family),
        ...(override.usage ?? {}),
      },
    };
  });
}

export function modelValueFromId(id: string): string {
  return `model:${id}`;
}

export function idFromModelValue(value: string): string {
  return value.startsWith("model:") ? value.slice("model:".length) : value;
}

export function packTitleFromId(packId: string): string {
  return packId
    .replace(/^kenney-/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function inferModel(name: string, packId: string): {
  categoryKind: ModelCategory;
  family: string;
  shape: TerrainShape | "";
} {
  const text = `${packId} ${name}`.toLowerCase();
  const shape = inferShape(text);
  // Only ground_* models (flat terrain tiles) are terrain. Bare "path" is NOT
  // included here because path_stone/path_wood etc. are 3D objects placed ON
  // terrain, not flat ground covers. ground_path* is still caught by \bground_.
  if (/\bground_|river|road/.test(text)) {
    return { categoryKind: "terrain", family: inferTerrainFamily(text), shape };
  }
  if (/(animal|pet|sloth|bunny|rabbit|fox|cheetah|cat|dog|bear|duck|cow|pig|sheep|chicken|fish)/.test(text)) {
    return { categoryKind: "animals", family: inferFamily(text, "animal"), shape: "" };
  }
  if (/(ship|craft|fighter|rocket|ufo|astronaut|alien)/.test(text)) {
    return { categoryKind: "ships", family: inferFamily(text, "ship"), shape: "" };
  }
  if (/(tree|pine|palm|bush|plant|flower|grass|rock|stone|log|stump|cactus|wood)/.test(text)) {
    return { categoryKind: "nature", family: inferFamily(text, "nature"), shape: "" };
  }
  if (/(house|building|tower|wall|door|roof|corridor|bridge|castle|market)/.test(text)) {
    return { categoryKind: "buildings", family: inferFamily(text, "building"), shape };
  }
  if (/(crate|barrel|box|sign|bed|fence|fruit|berry|coin|gem|key|chest)/.test(text)) {
    return { categoryKind: "props", family: inferFamily(text, "prop"), shape: "" };
  }
  return { categoryKind: "unknown", family: "", shape: "" };
}

function inferTerrainFamily(text: string): string {
  if (text.includes("river")) return "river";
  if (text.includes("path")) return "path";
  if (text.includes("road")) return "road";
  if (text.includes("grass")) return "grass";
  if (text.includes("sand")) return "sand";
  if (text.includes("snow")) return "snow";
  if (text.includes("dirt")) return "dirt";
  return "ground";
}

function inferFamily(text: string, fallback: string): string {
  const tokens = [
    "sloth", "bunny", "rabbit", "fox", "cheetah", "tree", "bush", "rock",
    "stone", "wood", "cactus", "ship", "craft", "ufo", "alien", "corridor",
    "bridge", "crate", "barrel", "fruit", "bed", "building", "tower",
  ];
  return tokens.find((token) => text.includes(token)) ?? fallback;
}

function inferShape(text: string): TerrainShape | "" {
  if (text.includes("straight")) return "straight";
  if (text.includes("corner") || text.includes("bend")) return "corner";
  if (text.includes("split")) return "split";
  if (text.includes("cross")) return "cross";
  if (text.includes("end")) return "end";
  if (text.includes("tile") || text.includes("open")) return "tile";
  return "";
}

function defaultUsage(categoryKind: ModelCategory, family: string): ModelUsage {
  const blank: ModelUsage = {
    showInLevelBuilder: false,
    terrain: false,
    object: false,
    rescueAnimal: false,
    goodGuyShip: false,
    badGuyShip: false,
    obstacle: false,
    landmark: false,
  };
  if (categoryKind === "terrain") {
    return { ...blank, showInLevelBuilder: true, terrain: true };
  }
  if (categoryKind === "animals") {
    return { ...blank, showInLevelBuilder: true, object: true, rescueAnimal: true };
  }
  if (categoryKind === "nature" || categoryKind === "props" || categoryKind === "buildings") {
    return { ...blank, showInLevelBuilder: true, object: true, landmark: categoryKind === "buildings" };
  }
  if (categoryKind === "ships" && family === "alien") {
    return { ...blank, badGuyShip: true };
  }
  return blank;
}

function parseUsageOverride(value: unknown): Partial<ModelUsage> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const out: Partial<ModelUsage> = {};
  for (const { key } of MODEL_USAGE_LABELS) {
    const next = (value as Partial<ModelUsage>)[key];
    if (typeof next === "boolean") out[key] = next;
  }
  return Object.keys(out).length ? out : undefined;
}

function isModelCategory(value: unknown): value is ModelCategory {
  return typeof value === "string" && value in MODEL_CATEGORY_LABELS;
}

function isTerrainShape(value: unknown): value is TerrainShape {
  return ["straight", "corner", "end", "split", "cross", "tile"].includes(String(value));
}
