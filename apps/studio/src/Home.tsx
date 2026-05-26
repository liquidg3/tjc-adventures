export type SectionId = "models" | "vertical" | "side" | "race";

interface SectionCard {
  id: SectionId;
  title: string;
  desc: string;
  status: "ready" | "wip" | "soon";
}

const SECTIONS: SectionCard[] = [
  { id: "models", title: "3D Models", desc: "Assign a model to every game asset slot.", status: "ready" },
  {
    id: "vertical",
    title: "Vertical Scroller",
    desc: "Camera, ship & scene settings for Raiden-style levels.",
    status: "ready",
  },
  { id: "side", title: "Side Scroller", desc: "Settings for side-scrolling levels.", status: "soon" },
  { id: "race", title: "Death Race", desc: "Settings for the racing level.", status: "soon" },
];

const BADGE: Record<SectionCard["status"], string> = {
  ready: "Ready",
  wip: "In progress",
  soon: "Coming soon",
};

/** Studio landing: big cards, one per section. */
export function Home({ onOpen }: { onOpen: (id: SectionId) => void }) {
  return (
    <div className="studio-home">
      <header>
        <h1>TJC — Studio</h1>
        <p>Creator tools. Pick a section to work in.</p>
      </header>
      <div className="studio-cards">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            className={`studio-card status-${s.status}`}
            disabled={s.status === "soon"}
            onClick={() => onOpen(s.id)}
          >
            <span className="studio-card-title">{s.title}</span>
            <span className="studio-card-desc">{s.desc}</span>
            <span className="studio-card-badge">{BADGE[s.status]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
