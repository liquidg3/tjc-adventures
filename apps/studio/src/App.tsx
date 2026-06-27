import { useEffect, useState } from "react";
import { AssetLibrary } from "./asset-library";
import { AssetPreview } from "./asset-preview";
import { Home, type SectionId } from "./Home";
import { LevelBuilder } from "./level-builder";
import { ThreeDModels } from "./3d-models";
import { UiBuilder } from "./ui-builder";
import { VerticalTestPlay } from "./vertical-test-play";
import { applyUiTheme, mergeUiTheme } from "./ui-theme-state";

const UI_THEME_URL = "/__ui-theme";
const SECTION_ALIASES: Partial<Record<string, SectionId>> = {
  models: "3d-models",
  assets: "asset-library",
  "asset-test": "asset-preview",
  ui: "ui-builder",
  vertical: "vertical-test-play",
  level: "level-builder",
  side: "side-scroller",
  race: "death-race",
};

const VALID_SECTIONS = new Set<SectionId>([
  "3d-models",
  "asset-library",
  "asset-preview",
  "ui-builder",
  "vertical-test-play",
  "level-builder",
  "side-scroller",
  "death-race",
]);

function readSectionFromHash(): SectionId | null {
  const raw = location.hash.replace(/^#/, "");
  const [sectionRaw, qs = ""] = raw.split("?");
  const aliased = SECTION_ALIASES[sectionRaw];
  if (aliased) {
    history.replaceState(
      null,
      "",
      `${location.pathname}${location.search}#${aliased}${qs ? `?${qs}` : ""}`,
    );
    return aliased;
  }
  const section = sectionRaw as SectionId | "";
  return VALID_SECTIONS.has(section as SectionId)
    ? section as SectionId
    : null;
}

/** Studio shell: a landing launcher, then the chosen section. */
export function App() {
  const [section, setSection] = useState<SectionId | null>(() => readSectionFromHash());

  useEffect(() => {
    const onLocationChange = () => setSection(readSectionFromHash());
    window.addEventListener("hashchange", onLocationChange);
    window.addEventListener("popstate", onLocationChange);
    return () => {
      window.removeEventListener("hashchange", onLocationChange);
      window.removeEventListener("popstate", onLocationChange);
    };
  }, []);

  useEffect(() => {
    fetch(UI_THEME_URL)
      .then((r) => r.json())
      .then((data) => applyUiTheme(mergeUiTheme(data)))
      .catch(() => {});
  }, []);

  const openSection = (id: SectionId) => {
    history.pushState(null, "", `${location.pathname}${location.search}#${id}`);
    setSection(id);
  };

  const goHome = () => {
    history.pushState(null, "", `${location.pathname}${location.search}`);
    setSection(null);
  };

  if (!section) return <Home onOpen={openSection} />;

  return (
    <div className="studio-section">
      <button className="studio-back" onClick={goHome}>
        ← Studio
      </button>
      {section === "3d-models" && <ThreeDModels />}
      {section === "asset-library" && <AssetLibrary />}
      {section === "asset-preview" && <AssetPreview />}
      {section === "ui-builder" && <UiBuilder />}
      {section === "vertical-test-play" && <VerticalTestPlay />}
      {section === "level-builder" && <LevelBuilder />}
    </div>
  );
}
