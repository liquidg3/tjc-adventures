import { useEffect, useState } from "react";
import { SLOTS, type AssetOption } from "./slots";
import { MODELS } from "./models";
import { SlotCard } from "./SlotCard";

// Built-in procedural placeholders are always available in every dropdown;
// discovered model files (src/models/) are added as they appear.
const BUILTINS: AssetOption[] = [
  { value: "builtin:interceptor", label: "Interceptor (built-in)", variant: "interceptor" },
  { value: "builtin:hauler", label: "Hauler (built-in)", variant: "hauler" },
  { value: "builtin:scout", label: "Scout (built-in)", variant: "scout" },
];
const OPTIONS: AssetOption[] = [
  ...BUILTINS,
  ...MODELS.map((m) => ({
    value: `model:${m.category}/${m.name}`,
    label: `${m.category}/${m.name}`,
    url: m.url,
  })),
];

// Assignments persist to a committed file (apps/studio/asset-map.json) via the
// dev server's /__asset-map endpoint — durable, in the repo, and readable by the
// game later. localStorage is just a fast offline fallback.
const ASSET_MAP_URL = "/__asset-map";
const STORAGE_KEY = "tjc-asset-slots";

const loadLocal = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
};

/** The 3D Models section: assign a model to each game asset slot. */
export function ModelsBoard() {
  const [assign, setAssign] = useState<Record<string, string>>(loadLocal);
  const [saved, setSaved] = useState(true);

  // load the durable file as the source of truth (falls back to localStorage)
  useEffect(() => {
    fetch(ASSET_MAP_URL)
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data === "object") setAssign(data);
      })
      .catch(() => {
        /* keep the localStorage fallback */
      });
  }, []);

  const set = (id: string, value: string) =>
    setAssign((prev) => {
      const next = { ...prev, [id]: value };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setSaved(false);
      fetch(ASSET_MAP_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next, null, 2),
      })
        .then(() => setSaved(true))
        .catch(() => setSaved(false));
      return next;
    });

  const allSlots = SLOTS.flatMap((c) => c.slots);
  const filled = allSlots.filter((s) => assign[s.id]).length;
  const missing = allSlots.filter((s) => !assign[s.id]).map((s) => s.label);
  const downloadedCount = OPTIONS.length - BUILTINS.length;

  return (
    <div className="studio">
      <header>
        <h1>3D Models</h1>
        <p>
          Assign a model to each asset slot the game needs. Downloaded models in{" "}
          <code>src/models/</code> appear in the dropdowns — run{" "}
          <code>npm run convert-models</code> to pull &amp; convert from ~/Downloads.
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
                value={assign[s.id] || ""}
                options={OPTIONS}
                onChange={(v) => set(s.id, v)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
