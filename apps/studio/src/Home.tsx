export type SectionId =
  | "models"
  | "assets"
  | "asset-test"
  | "ui"
  | "vertical"
  | "level"
  | "side"
  | "race";

type Status = "ready" | "wip" | "soon";

interface SectionCard {
  /** Routable id. Omitted for placeholder "coming soon" cards. */
  id?: SectionId;
  title: string;
  desc: string;
  status: Status;
}

interface SectionGroup {
  id: string;
  label: string;
  /** Short blurb under the group label so the user knows what lives here. */
  desc: string;
  sections: SectionCard[];
}

/**
 * Landing is split between universal Studio tools (work across every game mode)
 * and per-mode tools (Test Play + Level Builder, repeated under each game).
 * The mode groups share a card schema so adding a Side Scroller or Death Race
 * later is just filling in their Test Play / Level Builder cards.
 */
const GROUPS: SectionGroup[] = [
  {
    id: "universal",
    label: "Universal Tools",
    desc: "Work across every game mode — assets, models, theme.",
    sections: [
      { id: "models", title: "3D Models", desc: "Assign a model to every game asset slot.", status: "ready" },
      {
        id: "assets",
        title: "Asset Library",
        desc: "Browse CC0 packs to source scenery, ruins & props from.",
        status: "ready",
      },
      {
        id: "asset-test",
        title: "Asset Test",
        desc: "Preview imported Kenney packs in one shared 3D viewer.",
        status: "ready",
      },
      {
        id: "ui",
        title: "UI Builder",
        desc: "Map imported UI images to buttons, panels, inputs and cursors.",
        status: "ready",
      },
    ],
  },
  {
    id: "vertical-shooter",
    label: "Vertical Shooter",
    desc: "Raiden-style top-down scroller. The first mode being built out.",
    sections: [
      {
        id: "vertical",
        title: "Test Play",
        desc: "Live scene with camera / ship / lighting tuning panels.",
        status: "ready",
      },
      {
        id: "level",
        title: "Level Builder",
        desc: "Paint scenery + altitude onto a top-down grid (v1: authoring only).",
        status: "ready",
      },
    ],
  },
  {
    id: "side-scroller",
    label: "Side Scroller",
    desc: "Side-on flight — same toolset, different camera.",
    sections: [
      { title: "Test Play", desc: "Live scene + tuning, side-scrolling camera.", status: "soon" },
      { title: "Level Builder", desc: "Paint scenery + altitude onto a side-on grid.", status: "soon" },
    ],
  },
  {
    id: "death-race",
    label: "Death Race",
    desc: "Racing mode. Loop / circuit-based levels instead of straight scroll.",
    sections: [
      { title: "Test Play", desc: "Live scene + tuning, chase camera.", status: "soon" },
      { title: "Level Builder", desc: "Author a circuit + props + hazards.", status: "soon" },
    ],
  },
];

const BADGE: Record<Status, string> = {
  ready: "Ready",
  wip: "In progress",
  soon: "Coming soon",
};

/** Studio landing: grouped by Universal vs game-mode sections. */
export function Home({ onOpen }: { onOpen: (id: SectionId) => void }) {
  return (
    <div className="studio-home">
      <header>
        <h1>TJC — Studio</h1>
        <p>Creator tools. Pick a section to work in.</p>
      </header>
      {GROUPS.map((group) => (
        <section key={group.id} className="studio-group">
          <h2 className="studio-group-label">{group.label}</h2>
          <p className="studio-group-desc">{group.desc}</p>
          <div className="studio-cards">
            {group.sections.map((s, i) => (
              <button
                key={s.id ?? `${group.id}-${i}`}
                className={`studio-card status-${s.status}`}
                disabled={s.status === "soon" || !s.id}
                onClick={() => s.id && onOpen(s.id)}
              >
                <span className="studio-card-title">{s.title}</span>
                <div className="studio-card-body">
                  <span className="studio-card-desc">{s.desc}</span>
                  <span className="studio-card-badge">{BADGE[s.status]}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
