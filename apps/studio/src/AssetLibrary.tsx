import { useEffect, useRef, useState } from "react";

interface KenneyPack {
  slug: string;
  name: string;
}
interface Meta {
  preview: string;
  zip: string;
}

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
    fetch(`/__kenney/import?slug=${pack.slug}`, { method: "POST" })
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
      <div className="kenney-thumb">
        {meta?.preview ? (
          <img src={meta.preview} alt={pack.name} loading="lazy" />
        ) : (
          <div className="kenney-thumb-ph">{err ? "no preview" : "loading…"}</div>
        )}
      </div>
      <div className="card-head">
        <span className="card-title">{pack.name}</span>
        <span className="badge ok">CC0</span>
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

/** Live browser of every Kenney CC0 3D pack — preview + one-click download. */
export function AssetLibrary() {
  const [packs, setPacks] = useState<KenneyPack[] | null>(null);
  const [err, setErr] = useState(false);
  const [q, setQ] = useState("");
  // slugs already staged into public/models (so cards show what's imported)
  const [staged, setStaged] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/models/index.json")
      .then((r) => r.json())
      .then((d: { packs?: string[] }) =>
        setStaged(new Set((d.packs ?? []).map((p) => p.replace(/^kenney-/, "")))),
      )
      .catch(() => {});
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

  const needle = q.trim().toLowerCase();
  const list = (packs ?? []).filter((p) => p.name.toLowerCase().includes(needle));

  return (
    <div className="studio">
      <header>
        <h1>Asset Library — Kenney</h1>
        <p>
          Every Kenney CC0 3D pack, pulled live from kenney.nl. Hit <b>Import</b> on the
          ones you want — the dev server downloads, unzips, and stages them straight into
          committed <code>public/models/</code> (one click, no manual steps). Imported packs
          show up in <b>Asset Test</b> and the <b>3D Models</b> board.
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
          <input
            className="studio-search"
            placeholder={`Search ${packs.length} packs…`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <p className="dim" style={{ margin: "2px 0 12px" }}>
            {staged.size} imported so far.
          </p>
          <div className="grid">
            {list.map((p) => (
              <KenneyCard key={p.slug} pack={p} imported={staged.has(p.slug)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
