// The Studio's model options come from the packs you import in the Asset Library,
// which land in public/models/<pack>/ (index.json + per-pack manifest.json).
// Served at runtime, so we fetch rather than glob the source tree.
export interface ModelEntry {
  name: string;
  category: string; // pack name, e.g. "kenney-nature-kit"
  url: string;
  atlas: string; // "" when the GLB is self-contained (Kenney)
}

interface PackManifest {
  pack: string;
  models: Array<{ name: string; file: string; atlas: string }>;
}

/** Load every staged model across all imported packs, grouped by pack. */
export async function loadStagedModels(): Promise<ModelEntry[]> {
  const idx = await fetch("/models/index.json")
    .then((r) => r.json())
    .catch(() => ({ packs: [] as string[] }));
  const packs: string[] = idx.packs ?? [];
  const manifests = await Promise.all(
    packs.map((p) =>
      fetch(`/models/${p}/manifest.json`)
        .then((r) => r.json() as Promise<PackManifest>)
        .catch(() => null),
    ),
  );
  const out: ModelEntry[] = [];
  for (const m of manifests) {
    if (!m) continue;
    for (const model of m.models) {
      out.push({
        name: model.name,
        category: m.pack,
        url: `/models/${m.pack}/${model.file}`,
        atlas: model.atlas ? `/models/${m.pack}/${model.atlas}` : "",
      });
    }
  }
  return out.sort((a, b) => `${a.category}/${a.name}`.localeCompare(`${b.category}/${b.name}`));
}
