import { useEffect, useState } from "react";
import { AssetLibrary } from "./AssetLibrary";
import { AssetTest } from "./AssetTest";
import { Home, type SectionId } from "./Home";
import { LevelBuilder } from "./LevelBuilder";
import { ModelsBoard } from "./ModelsBoard";
import { UiBuilder } from "./UiBuilder";
import { VerticalScroller } from "./VerticalScroller";
import { applyUiTheme, mergeUiTheme } from "./ui-theme-state";

const UI_THEME_URL = "/__ui-theme";

function readSectionFromHash(): SectionId | null {
  const raw = location.hash.replace(/^#/, "");
  const section = raw.split("?")[0] as SectionId | "";
  return section === "models" ||
    section === "assets" ||
    section === "asset-test" ||
    section === "ui" ||
    section === "vertical" ||
    section === "level" ||
    section === "side" ||
    section === "race"
    ? section
    : null;
}

/** Studio shell: a landing launcher, then the chosen section. */
export function App() {
  const [section, setSection] = useState<SectionId | null>(() => readSectionFromHash());

  useEffect(() => {
    const onHashChange = () => setSection(readSectionFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    fetch(UI_THEME_URL)
      .then((r) => r.json())
      .then((data) => applyUiTheme(mergeUiTheme(data)))
      .catch(() => {});
  }, []);

  const openSection = (id: SectionId) => {
    history.replaceState(null, "", `${location.pathname}${location.search}#${id}`);
    setSection(id);
  };

  const goHome = () => {
    history.replaceState(null, "", `${location.pathname}${location.search}`);
    setSection(null);
  };

  if (!section) return <Home onOpen={openSection} />;

  return (
    <div className="studio-section">
      <button className="studio-back" onClick={goHome}>
        ← Studio
      </button>
      {section === "models" && <ModelsBoard />}
      {section === "assets" && <AssetLibrary />}
      {section === "asset-test" && <AssetTest />}
      {section === "ui" && <UiBuilder />}
      {section === "vertical" && <VerticalScroller />}
      {section === "level" && <LevelBuilder />}
    </div>
  );
}
