import { useEffect, useMemo, useRef, useState } from "react";

type KenneyKind = "3d" | "ui";

interface KenneyPack {
  slug: string;
  name: string;
  kind: KenneyKind;
}
interface Meta {
  preview: string;
  zip: string;
}

const KIND_LABEL: Record<KenneyKind, string> = { "3d": "3D", ui: "UI" };

/**
 * One Kenney pack card. Lazily fetches its preview image + download URL (the dev
 * server scrapes kenney.nl) when scrolled into view, so the grid doesn't hammer
 * Kenney with dozens of requests at once.
 */
function KenneyCard({ pack, imported }: { pack: KenneyPack; imported: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [err, setErr] = useState(false);
  const [seen, setSeen] = useState(false);
  const [imp, setImp] = useState<"idle" | "busy" | "done" | "err">("idle");
  const [count, setCount] = useState(0);

  const doImport = () => {
    setImp("busy");
    fetch(`/__kenney/import?slug=${pack.slug}&kind=${pack.kind}`, { method: "POST" })
      .then((r) => r.json())
      .then((d: { count?: number; error?: string }) => {
        if (d.error || d.count == null) setImp("err");
        else {
          setCount(d.count);
          setImp("done");
        }
      })
      .catch(() => setImp("err"));
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setSeen(true);
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!seen || meta || err) return;
    fetch(`/__kenney/meta?slug=${pack.slug}`)
      .then((r) => r.json())
      .then((m: Meta & { error?: string }) => {
        if (m.error || (!m.preview && !m.zip)) setErr(true);
        else setMeta(m);
      })
      .catch(() => setErr(true));
  }, [seen, pack.slug, meta, err]);

  return (
    <div ref={ref} className="card pack-card">
      {/* Title FIRST so it lands in the content-card header band; thumb +
          controls live in the body zone below. */}
      <div className="card-head">
        <span className="card-title">{pack.name}</span>
        <span className={`badge kind-${pack.kind}`}>{KIND_LABEL[pack.kind]}</span>
        <span className="badge ok">CC0</span>
      </div>
      <div className="kenney-thumb">
        {meta?.preview ? (
          <img src={meta.preview} alt={pack.name} loading="lazy" />
        ) : (
          <div className="kenney-thumb-ph">{err ? "no preview" : "loading…"}</div>
        )}
      </div>
      <div className="card-controls">
        <button
          className={`kenney-import ${imp === "idle" && imported ? "done" : imp}`}
          disabled={imp === "busy"}
          onClick={doImport}
        >
          {imp === "busy"
            ? "importing…"
            : imp === "done"
              ? `✓ ${count} staged`
              : imp === "err"
                ? "failed — retry"
                : imported
                  ? "✓ imported · re-import"
                  : "↧ Import"}
        </button>
        {meta?.zip && (
          <a className="pack-link" href={meta.zip}>
            zip
          </a>
        )}
        <a
          className="pack-link"
          href={`https://kenney.nl/assets/${pack.slug}`}
          target="_blank"
          rel="noreferrer"
        >
          Kenney ↗
        </a>
      </div>
    </div>
  );
}

type Filter = "all" | KenneyKind;

/** Live browser of every Kenney CC0 3D + UI pack — preview + one-click import. */
export function AssetLibrary() {
  const [packs, setPacks] = useState<KenneyPack[] | null>(null);
  const [err, setErr] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  // slugs already staged into public/{models,ui} (so cards show what's imported)
  const [staged3d, setStaged3d] = useState<Set<string>>(new Set());
  const [stagedUI, setStagedUI] = useState<Set<string>>(new Set());

  useEffect(() => {
    const loadStaged = (url: string, setter: (s: Set<string>) => void) =>
      fetch(url)
        .then((r) => r.json())
        .then((d: { packs?: string[] }) =>
          setter(new Set((d.packs ?? []).map((p) => p.replace(/^kenney-/, "")))),
        )
        .catch(() => {});
    loadStaged("/models/index.json", setStaged3d);
    loadStaged("/ui/index.json", setStagedUI);
  }, []);

  useEffect(() => {
    fetch("/__kenney/list")
      .then((r) => r.json())
      .then((d: { packs?: KenneyPack[]; error?: string }) => {
        if (d.error || !d.packs) setErr(true);
        else setPacks(d.packs);
      })
      .catch(() => setErr(true));
  }, []);

  const importedFor = (p: KenneyPack) =>
    p.kind === "ui" ? stagedUI.has(p.slug) : staged3d.has(p.slug);

  const counts = useMemo(() => {
    const c = { all: packs?.length ?? 0, "3d": 0, ui: 0 };
    for (const p of packs ?? []) c[p.kind]++;
    return c;
  }, [packs]);

  const needle = q.trim().toLowerCase();
  const list = (packs ?? []).filter(
    (p) => (filter === "all" || p.kind === filter) && p.name.toLowerCase().includes(needle),
  );

  return (
    <div className="studio">
      <header>
        <h1>Asset Library — Kenney</h1>
        <p>
          Every Kenney CC0 3D and UI pack, pulled live from kenney.nl. Hit
          <b> Import</b> on the ones you want — the dev server downloads, unzips
          and stages them into committed <code>public/models/</code> (3D) or
          <code> public/ui/</code> (UI). Imported 3D packs show up in
          <b> Asset Test</b> and the <b>3D Models</b> board.
        </p>
      </header>

      {err && (
        <p className="dim">
          Couldn&apos;t reach the Kenney catalog (dev server offline, or a restart is
          needed for the new endpoint). Meanwhile, browse{" "}
          <a href="https://kenney.nl/assets/category:3D" target="_blank" rel="noreferrer">
            kenney.nl ↗
          </a>
          .
        </p>
      )}
      {!err && !packs && <p className="dim">Loading Kenney catalog…</p>}

      {packs && (
        <>
          <div className="kenney-filters">
            {(["all", "3d", "ui"] as Filter[]).map((f) => (
              <button
                key={f}
                className={`kenney-filter ${filter === f ? "on" : ""}`}
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "All" : KIND_LABEL[f]} <span className="dim">({counts[f]})</span>
              </button>
            ))}
          </div>
          <input
            className="studio-search"
            placeholder={`Search ${counts[filter]} ${filter === "all" ? "packs" : KIND_LABEL[filter] + " packs"}…`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <p className="dim" style={{ margin: "2px 0 12px" }}>
            {staged3d.size} 3D + {stagedUI.size} UI imported so far.
          </p>
          <div className="grid">
            {list.map((p) => (
              <KenneyCard key={p.slug} pack={p} imported={importedFor(p)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
