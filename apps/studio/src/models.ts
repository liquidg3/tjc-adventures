// Auto-discovers every .glb / .gltf under src/models/ (any category subfolder)
// — no manual list. Drop files in (or run `npm run convert-models` /
// `node scripts/import-models.mjs`) and they appear in the Studio dropdowns.
const modules = import.meta.glob("./models/**/*.{glb,gltf}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

export interface ModelEntry {
  name: string;
  category: string;
  url: string;
}

export const MODELS: ModelEntry[] = Object.entries(modules)
  .map(([path, url]) => {
    const rel = path.replace(/^\.\/models\//, "");
    const parts = rel.split("/");
    const category = parts.length > 1 ? parts[0] : "misc";
    const name = parts[parts.length - 1].replace(/\.(glb|gltf)$/i, "");
    return { name, category, url };
  })
  .sort((a, b) => `${a.category}/${a.name}`.localeCompare(`${b.category}/${b.name}`));
