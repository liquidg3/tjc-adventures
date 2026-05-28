import { useEffect, useMemo, useRef, useState } from "react";
import { createViewer, type ViewerHandle } from "./viewer-scene";
import {
  getDefaultNormalizationPresets,
  getNormalizationPreset,
  mergeNormalizationPresets,
  suggestPresetForModel,
  type AssetNormalization,
} from "./asset-normalization";

// per-page-load cache-buster — staged GLBs change on re-stage and browsers cache
// .glb aggressively, so a fresh load should always re-fetch them
const BUST = Date.now();

interface ModelEntry {
  name: string;
  file: string;
  atlas: string;
}
interface PackManifest {
  pack: string;
  models: ModelEntry[];
}
interface Selection {
  pack: string;
  model: ModelEntry;
}

/**
 * One shared 3D viewer that loads whichever model you pick — so the page only
 * ever holds a single WebGL context, no matter how big the pack. Recreating the
 * engine on selection (dispose-then-create) keeps it at exactly one.
 */
function AssetViewer({
  modelUrl,
  atlasUrl,
  normalization,
}: {
  modelUrl: string;
  atlasUrl: string;
  normalization: AssetNormalization;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<ViewerHandle | null>(null);
  const [status, setStatus] = useState("");

  // recreate the engine when the model changes (cleanup disposes the old first,
  // so there's never more than one live context)
  useEffect(() => {
    if (!canvasRef.current) return;
    const h = createViewer(
      canvasRef.current,
      { modelUrl, atlasUrl, spin: true, view: "isometric", normalization },
      setStatus,
    );
    handleRef.current = h;
    return () => {
      h.dispose();
      handleRef.current = null;
    };
    // setStatus is a stable React setter — intentionally not a dep so it
    // doesn't churn the engine. (Other props don't change in this screen.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atlasUrl, modelUrl, normalization]);

  return (
    <div className="asset-stage">
      <canvas ref={canvasRef} className="asset-viewer-canvas" />
      {status && <div className="asset-status">{status}</div>}
    </div>
  );
}

/** Browse a staged pack with one shared 3D viewer + live orientation controls. */
export function AssetTest() {
  const [packs, setPacks] = useState<PackManifest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Selection | null>(null);
  const [openPacks, setOpenPacks] = useState<Record<string, boolean>>({});
  const [presetValues, setPresetValues] = useState(getDefaultNormalizationPresets);

  useEffect(() => {
    fetch("/__asset-normalization-presets")
      .then((r) => r.json())
      .then((data) => setPresetValues(mergeNormalizationPresets(data)))
      .catch(() => {
        /* keep defaults */
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/models/index.json")
      .then((r) => {
        if (!r.ok) throw new Error("no index");
        return r.json();
      })
      .then(async (idx: { packs?: string[] }) => {
        const manifests = await Promise.all(
          (idx.packs ?? []).map((p) =>
            fetch(`/models/${p}/manifest.json`).then((r) => r.json() as Promise<PackManifest>),
          ),
        );
        if (cancelled) return;
        setPacks(manifests);
        setOpenPacks(
          Object.fromEntries(manifests.map((m) => [m.pack, false]))
        );
        const first = manifests.find((m) => m.models.length);
        if (first) setSel({ pack: first.pack, model: first.models[0] });
      })
      .catch(() => {
        if (!cancelled) setError("No packs staged yet — Import some from the Asset Library.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const needle = q.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      (packs ?? []).map((pk) => ({
        pack: pk.pack,
        models: needle ? pk.models.filter((m) => m.name.toLowerCase().includes(needle)) : pk.models,
      })),
    [packs, needle],
  );

  const selectedNormalization =
    sel == null
      ? getNormalizationPreset(presetValues, "none")
      : getNormalizationPreset(
          presetValues,
          suggestPresetForModel(`model:${sel.pack}/${sel.model.name}`),
        );

  return (
    <div className="studio">
      <header>
        <h1>Asset Test</h1>
        <p>
          Pick a model to preview it in the shared 3D viewer (one WebGL context, so it
          scales to any pack size). Import packs from the <b>Asset Library</b> (or stage a
          local folder with <code>node scripts/stage-pack.mjs</code>); they live in
          committed <code>public/models/</code> (Kenney is CC0).
        </p>
      </header>
      {error && <p className="dim">{error}</p>}
      {!error && !packs && <p className="dim">Loading staged packs…</p>}

      {packs && (
        <div className="asset-test-layout">
          <div className="asset-list">
            <input
              className="studio-search"
              placeholder="Filter models…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {filtered.map((pk) => (
              <div key={pk.pack}>
                <button
                  className="asset-list-pack"
                  type="button"
                  onClick={() => setOpenPacks((prev) => ({ ...prev, [pk.pack]: !prev[pk.pack] }))}
                >
                  <span>{openPacks[pk.pack] ? "▾" : "▸"}</span>
                  <span>{pk.pack} ({pk.models.length})</span>
                </button>
                {openPacks[pk.pack] && pk.models.map((m) => (
                  <button
                    key={m.name}
                    className={`asset-item ${sel?.model.name === m.name && sel?.pack === pk.pack ? "active" : ""}`}
                    onClick={() => setSel({ pack: pk.pack, model: m })}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            ))}
          </div>

          {sel ? (
            <AssetViewer
              modelUrl={`/models/${sel.pack}/${sel.model.file}?v=${BUST}`}
              atlasUrl={sel.model.atlas ? `/models/${sel.pack}/${sel.model.atlas}?v=${BUST}` : ""}
              normalization={selectedNormalization}
            />
          ) : (
            <div className="asset-stage">
              <p className="dim">Pick a model from the list.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
