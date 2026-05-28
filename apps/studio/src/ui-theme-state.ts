export type UiChromeRoleId =
  | "button-default"
  | "button-hover"
  | "button-active"
  | "button-disabled"
  | "input"
  | "toolbar"
  | "card-home"
  | "card-content"
  | "panel-side"
  | "grid-outline"
  | "badge-default";

export interface UiChromeRole {
  image: string;
  slice: string;
  width: string;
  fill: boolean;
  padding: string;
  headerPadding: string;
  bodyPadding: string;
  textColor: string;
  fillColor: string;
  uppercase: boolean;
  letterSpacing: string;
}

export interface UiCursorRole {
  image: string;
  hotspot: [number, number];
}

export interface UiTheme {
  version: 1;
  roles: Record<UiChromeRoleId, UiChromeRole>;
  cursors: {
    default: UiCursorRole;
    pointer: UiCursorRole;
  };
}

export interface UiAssetEntry {
  name: string;
  pack: string;
  file: string;
  url: string;
}

interface UiPackManifest {
  pack: string;
  kind: "ui";
  items: Array<{ name: string; file: string }>;
}

export const UI_ROLE_LABELS: Record<UiChromeRoleId, string> = {
  "button-default": "Button",
  "button-hover": "Button hover",
  "button-active": "Button active",
  "button-disabled": "Button disabled",
  input: "Input",
  toolbar: "Toolbar",
  "card-home": "Home card",
  "card-content": "Content card",
  "panel-side": "Side panel",
  "grid-outline": "Grid outline",
  "badge-default": "Badge",
};

export const UI_ROLE_ORDER = Object.keys(UI_ROLE_LABELS) as UiChromeRoleId[];

const ROLE_DEFAULTS: Omit<UiChromeRole, "image"> = {
  slice: "8",
  width: "8px",
  fill: true,
  padding: "0",
  headerPadding: "0",
  bodyPadding: "0",
  textColor: "#e6ebf5",
  fillColor: "transparent",
  uppercase: false,
  letterSpacing: "0",
};

export const DEFAULT_UI_THEME: UiTheme = {
  version: 1,
  cursors: {
    default: {
      image: "/ui/kenney-ui-pack-sci-fi/PNG/Extra/Default/cursor_a.png",
      hotspot: [2, 2],
    },
    pointer: {
      image: "/ui/kenney-ui-pack-sci-fi/PNG/Extra/Default/cursor_b.png",
      hotspot: [8, 4],
    },
  },
  roles: {
    "button-default": role({
      image: "/ui/kenney-ui-pack-sci-fi/PNG/Blue/Default/bar_round_small.png",
      padding: "7px 16px",
      textColor: "#ffffff",
      uppercase: true,
      letterSpacing: "0.05em",
    }),
    "button-hover": role({
      image: "/ui/kenney-ui-pack-sci-fi/PNG/Blue/Default/bar_round_gloss_small.png",
      padding: "7px 16px",
      textColor: "#ffffff",
      uppercase: true,
      letterSpacing: "0.05em",
    }),
    "button-active": role({
      image: "/ui/kenney-ui-pack-sci-fi/PNG/Green/Default/bar_round_gloss_small.png",
      padding: "7px 16px",
      textColor: "#f1ffec",
      fillColor: "#22c56f",
      uppercase: true,
      letterSpacing: "0.05em",
    }),
    "button-disabled": role({
      image: "/ui/kenney-ui-pack-sci-fi/PNG/Grey/Default/bar_round_small.png",
      padding: "7px 16px",
      textColor: "#ffffff",
      uppercase: true,
      letterSpacing: "0.05em",
    }),
    input: role({
      image: "/ui/kenney-ui-pack-sci-fi/PNG/Grey/Default/bar_round_small.png",
      padding: "6px 12px",
    }),
    toolbar: role({
      image: "/ui/kenney-ui-pack-sci-fi/PNG/Grey/Default/bar_round_large.png",
      slice: "12",
      width: "12px",
      padding: "14px 20px",
    }),
    "card-home": role({
      image: "/ui/kenney-ui-pack-sci-fi/PNG/Blue/Double/button_square_header_large_rectangle.png",
      slice: "52 24 24 24",
      width: "26px 12px 12px 12px",
      headerPadding: "6px 18px 0",
      bodyPadding: "22px 18px 18px",
      textColor: "#ffffff",
      uppercase: true,
      letterSpacing: "0.05em",
    }),
    "card-content": role({
      image: "/ui/kenney-ui-pack-sci-fi/PNG/Blue/Default/button_square_header_blade_rectangle.png",
      slice: "28 12 12 12",
      width: "28px 12px 12px 12px",
      headerPadding: "6px 16px 0",
      bodyPadding: "16px 16px 16px",
    }),
    "panel-side": role({
      image: "/ui/kenney-ui-pack-sci-fi/PNG/Grey/Default/button_square_header_notch_rectangle.png",
      slice: "28 12 12 12",
      width: "28px 12px 12px 12px",
      headerPadding: "6px 16px 0",
      bodyPadding: "30px 16px 16px",
    }),
    "grid-outline": role({
      image: "/ui/kenney-ui-pack-sci-fi/PNG/Grey/Default/bar_round_large.png",
      slice: "12",
      width: "12px",
      fill: false,
      padding: "12px",
    }),
    "badge-default": role({
      image: "/ui/kenney-ui-pack-sci-fi/PNG/Grey/Default/bar_round_small.png",
      padding: "2px 10px",
      letterSpacing: "0.04em",
    }),
  },
};

export function mergeUiTheme(raw: unknown): UiTheme {
  const base = cloneTheme(DEFAULT_UI_THEME);
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Partial<UiTheme>;
  if (obj.cursors && typeof obj.cursors === "object") {
    base.cursors.default = mergeCursor(base.cursors.default, obj.cursors.default);
    base.cursors.pointer = mergeCursor(base.cursors.pointer, obj.cursors.pointer);
  }
  if (obj.roles && typeof obj.roles === "object") {
    for (const id of UI_ROLE_ORDER) {
      base.roles[id] = mergeRole(base.roles[id], obj.roles[id]);
    }
  }
  return base;
}

export function applyUiTheme(theme: UiTheme, root: HTMLElement = document.documentElement) {
  for (const id of UI_ROLE_ORDER) {
    const role = theme.roles[id];
    const prefix = `--ui-${id}`;
    root.style.setProperty(`${prefix}-image`, cssUrl(role.image));
    root.style.setProperty(`${prefix}-slice`, `${role.slice}${role.fill ? " fill" : ""}`);
    root.style.setProperty(`${prefix}-width`, role.width);
    root.style.setProperty(`${prefix}-padding`, role.padding);
    root.style.setProperty(`${prefix}-header-padding`, role.headerPadding);
    root.style.setProperty(`${prefix}-body-padding`, role.bodyPadding);
    root.style.setProperty(`${prefix}-color`, role.textColor);
    root.style.setProperty(`${prefix}-bg`, role.fillColor);
    root.style.setProperty(`${prefix}-transform`, role.uppercase ? "uppercase" : "none");
    root.style.setProperty(`${prefix}-spacing`, role.letterSpacing);
  }
  root.style.setProperty(
    "--ui-cursor-default",
    `${cssUrl(theme.cursors.default.image)} ${theme.cursors.default.hotspot[0]} ${theme.cursors.default.hotspot[1]}, default`,
  );
  root.style.setProperty(
    "--ui-cursor-pointer",
    `${cssUrl(theme.cursors.pointer.image)} ${theme.cursors.pointer.hotspot[0]} ${theme.cursors.pointer.hotspot[1]}, pointer`,
  );
}

export async function loadUiAssets(): Promise<UiAssetEntry[]> {
  const idx = await fetch("/ui/index.json")
    .then((r) => r.json())
    .catch(() => ({ packs: [] as string[] }));
  const packs: string[] = Array.isArray(idx.packs) ? idx.packs : [];
  const manifests = await Promise.all(
    packs.map((pack) =>
      fetch(`/ui/${pack}/manifest.json`)
        .then((r) => r.json() as Promise<UiPackManifest>)
        .catch(() => null),
    ),
  );
  const out: UiAssetEntry[] = [];
  for (const manifest of manifests) {
    if (!manifest) continue;
    for (const item of manifest.items) {
      out.push({
        name: item.name,
        pack: manifest.pack,
        file: item.file,
        url: `/ui/${manifest.pack}/${item.file}`,
      });
    }
  }
  return out.sort((a, b) => `${a.pack}/${a.name}`.localeCompare(`${b.pack}/${b.name}`));
}

export function cloneTheme(theme: UiTheme): UiTheme {
  return {
    version: 1,
    cursors: {
      default: { image: theme.cursors.default.image, hotspot: [...theme.cursors.default.hotspot] },
      pointer: { image: theme.cursors.pointer.image, hotspot: [...theme.cursors.pointer.hotspot] },
    },
    roles: Object.fromEntries(
      UI_ROLE_ORDER.map((id) => [id, { ...theme.roles[id] }]),
    ) as Record<UiChromeRoleId, UiChromeRole>,
  };
}

function role(config: { image: string } & Partial<Omit<UiChromeRole, "image">>): UiChromeRole {
  const merged = { ...ROLE_DEFAULTS, ...config };
  return {
    ...merged,
    headerPadding: config.headerPadding ?? config.padding ?? ROLE_DEFAULTS.headerPadding,
    bodyPadding: config.bodyPadding ?? config.padding ?? ROLE_DEFAULTS.bodyPadding,
  };
}

function mergeRole(base: UiChromeRole, raw: unknown): UiChromeRole {
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Partial<UiChromeRole>;
  return {
    image: str(obj.image, base.image),
    slice: str(obj.slice, base.slice),
    width: str(obj.width, base.width),
    fill: typeof obj.fill === "boolean" ? obj.fill : base.fill,
    padding: str(obj.padding, base.padding),
    headerPadding: str(obj.headerPadding, base.headerPadding),
    bodyPadding: str(obj.bodyPadding, base.bodyPadding),
    textColor: str(obj.textColor, base.textColor),
    fillColor: str(obj.fillColor, base.fillColor),
    uppercase: typeof obj.uppercase === "boolean" ? obj.uppercase : base.uppercase,
    letterSpacing: str(obj.letterSpacing, base.letterSpacing),
  };
}

function mergeCursor(base: UiCursorRole, raw: unknown): UiCursorRole {
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Partial<UiCursorRole> & { hotspot?: unknown };
  return {
    image: str(obj.image, base.image),
    hotspot: Array.isArray(obj.hotspot) && obj.hotspot.length === 2
      ? [num(obj.hotspot[0], base.hotspot[0]), num(obj.hotspot[1], base.hotspot[1])]
      : [...base.hotspot],
  };
}

function cssUrl(url: string) {
  return `url(${JSON.stringify(url).slice(1, -1)})`;
}

function str(value: unknown, fallback: string) {
  return typeof value === "string" && value ? value : fallback;
}

function num(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
