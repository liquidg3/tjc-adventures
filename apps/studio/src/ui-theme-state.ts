/**
 * UI theme — Studio chrome roles, each typed as a kind-specific recipe.
 *
 * The previous flat schema treated every chrome element the same (image, slice,
 * padding, headerPadding, bodyPadding, …) which forced cards to fight buttons
 * for the same knobs. This rewrite splits roles into three kinds:
 *
 *   • BarRole       — horizontal pill from a bar_* image, single uniform slice
 *                     (buttons, inputs, toolbars, badges).
 *   • CardRole      — composite header-band card (button_square_header_* or
 *                     panel_glass_*). The source image's top slice IS the
 *                     header-band pixel height; we publish that as
 *                     --ui-<id>-header-h so the title element can match it via
 *                     min-height — text naturally lands inside the band.
 *   • OutlineRole   — same border-image as a bar but `fill` is off; used by the
 *                     Level Builder grid frame and any "outline only" chrome.
 *
 * Cursors stay separate (no border-image, no padding, just url + hotspot).
 *
 * Migration: any field can arrive in the old flat shape; the merger detects
 * legacy entries and folds them into the right kind without losing the user's
 * image picks.
 */

export type UiChromeRoleId =
  | "button-default"
  | "button-hover"
  | "button-active"
  | "button-critical"
  | "button-disabled"
  | "input"
  | "input-focus"
  | "toolbar"
  | "card-home"
  | "card-content"
  | "grid-outline"
  | "badge-default";

export type RoleKind = "bar" | "card" | "outline";

/** Canonical 4-tuple for CSS box values (slice, padding). */
export interface BoxValue {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface BarRole {
  kind: "bar";
  image: string;
  /** Uniform slice in source pixels (border-image-slice = N N N N). */
  slice: number;
  /** Border-image-width in pixels (defaults to slice when 0). */
  width: number;
  padding: BoxValue;
  textColor: string;
  fillColor: string;
  uppercase: boolean;
  letterSpacing: string;
}

export interface CardRole {
  kind: "card";
  image: string;
  /** Per-edge slice (top = header band height in source pixels). */
  slice: BoxValue;
  /** Border-image-width per edge (defaults to slice when 0). */
  width: BoxValue;
  /** Padding INSIDE the header zone (around the title text). */
  padHeader: BoxValue;
  /** Padding INSIDE the body zone (around desc/controls). */
  padBody: BoxValue;
  headerTextColor: string;
  bodyTextColor: string;
  fillColor: string;
  headerUppercase: boolean;
  letterSpacing: string;
}

export interface OutlineRole {
  kind: "outline";
  image: string;
  /** Uniform slice (no `fill` keyword — middle stays transparent). */
  slice: number;
  width: number;
  padding: BoxValue;
  textColor: string;
  fillColor: string;
}

export type ChromeRole = BarRole | CardRole | OutlineRole;

export interface UiCursorRole {
  image: string;
  hotspot: [number, number];
}

export type UiColorTokenId =
  | "textPrimary"
  | "textMuted"
  | "panelHeading"
  | "panelBody"
  | "controlLabel"
  | "controlBorder"
  | "controlSurface"
  | "focus"
  | "selection"
  | "success"
  | "warning"
  | "danger"
  | "checkerDark"
  | "checkerLight";

export type UiColorTokens = Record<UiColorTokenId, string>;

export interface UiTheme {
  version: 2;
  roles: Record<UiChromeRoleId, ChromeRole>;
  colors: UiColorTokens;
  cursors: {
    default: UiCursorRole;
    pointer: UiCursorRole;
  };
}

/** Fixed mapping role-id → kind. Roles never change kind. */
export const ROLE_KIND: Record<UiChromeRoleId, RoleKind> = {
  "button-default": "bar",
  "button-hover": "bar",
  "button-active": "bar",
  "button-critical": "bar",
  "button-disabled": "bar",
  input: "bar",
  "input-focus": "bar",
  toolbar: "bar",
  "card-home": "card",
  "card-content": "card",
  "grid-outline": "outline",
  "badge-default": "bar",
};

export const UI_ROLE_LABELS: Record<UiChromeRoleId, string> = {
  "button-default": "Button",
  "button-hover": "Button hover",
  "button-active": "Button active",
  "button-critical": "Button critical",
  "button-disabled": "Button disabled",
  input: "Input",
  "input-focus": "Input (focused)",
  toolbar: "Toolbar",
  "card-home": "Home card",
  "card-content": "Content card",
  "grid-outline": "Grid outline",
  "badge-default": "Badge",
};

export const UI_ROLE_ORDER = Object.keys(UI_ROLE_LABELS) as UiChromeRoleId[];

export const UI_COLOR_LABELS: Record<UiColorTokenId, string> = {
  textPrimary: "Text primary",
  textMuted: "Text muted",
  panelHeading: "Panel heading",
  panelBody: "Panel body",
  controlLabel: "Control label",
  controlBorder: "Control border",
  controlSurface: "Control surface",
  focus: "Focus",
  selection: "Selection",
  success: "Success",
  warning: "Warning",
  danger: "Danger",
  checkerDark: "Checker dark",
  checkerLight: "Checker light",
};

export const UI_COLOR_HELP: Record<UiColorTokenId, string> = {
  textPrimary: "Main readable text on dark Studio surfaces.",
  textMuted: "Secondary help text, counts, hints, and preview labels.",
  panelHeading: "Headings inside editor panels and system-color preview.",
  panelBody: "Dark native dropdown option background.",
  controlLabel: "Labels above inputs, color fields, checkboxes, and legends.",
  controlBorder: "Thin outlines around editor hints, fieldsets, asset tiles, and previews.",
  controlSurface: "Dark fill behind editor hints, fieldsets, preview tiles, and small code chips.",
  focus: "Focus ring on inputs, selects, and textareas.",
  selection: "Selected markers: active left rail, selected preview, selected asset, pills.",
  success: "Positive status color; reserved for saved/ready states.",
  warning: "Caution status color; reserved for WIP/attention states.",
  danger: "Error/destructive status color and invalid slice warnings.",
  checkerDark: "Dark square in transparent-image checkerboards.",
  checkerLight: "Light square in transparent-image checkerboards.",
};

export const UI_COLOR_ORDER = Object.keys(UI_COLOR_LABELS) as UiColorTokenId[];

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

// -------------------------------------------------------------------------
// Defaults
// -------------------------------------------------------------------------

function box(t: number, r = t, b = t, l = r): BoxValue {
  return { top: t, right: r, bottom: b, left: l };
}

function bar(image: string, opts: Partial<Omit<BarRole, "kind" | "image">> = {}): BarRole {
  return {
    kind: "bar",
    image,
    slice: opts.slice ?? 8,
    width: opts.width ?? opts.slice ?? 8,
    padding: opts.padding ?? box(7, 16),
    textColor: opts.textColor ?? "#ffffff",
    fillColor: opts.fillColor ?? "transparent",
    uppercase: opts.uppercase ?? true,
    letterSpacing: opts.letterSpacing ?? "0.05em",
  };
}

function card(image: string, opts: Partial<Omit<CardRole, "kind" | "image">> = {}): CardRole {
  const slice = opts.slice ?? box(28, 12, 12, 12);
  return {
    kind: "card",
    image,
    slice,
    width: opts.width ?? slice,
    padHeader: opts.padHeader ?? box(0, 14, 0, 14),
    padBody: opts.padBody ?? box(8, 16, 16, 16),
    headerTextColor: opts.headerTextColor ?? "#ffffff",
    bodyTextColor: opts.bodyTextColor ?? "#2b3358",
    fillColor: opts.fillColor ?? "transparent",
    headerUppercase: opts.headerUppercase ?? true,
    letterSpacing: opts.letterSpacing ?? "0.05em",
  };
}

function outline(image: string, opts: Partial<Omit<OutlineRole, "kind" | "image">> = {}): OutlineRole {
  return {
    kind: "outline",
    image,
    slice: opts.slice ?? 12,
    width: opts.width ?? opts.slice ?? 12,
    padding: opts.padding ?? box(12),
    textColor: opts.textColor ?? "#e6ebf5",
    fillColor: opts.fillColor ?? "transparent",
  };
}

export const DEFAULT_UI_THEME: UiTheme = {
  version: 2,
  colors: {
    textPrimary: "#e6ebf5",
    textMuted: "#9aa6c4",
    panelHeading: "#d5e3ff",
    panelBody: "#2b3358",
    controlLabel: "#dbe6ff",
    controlBorder: "#566481",
    controlSurface: "#10172a",
    focus: "#9ad0ff",
    selection: "#6affb0",
    success: "#6affb0",
    warning: "#ffd76a",
    danger: "#ff8a8a",
    checkerDark: "#0b1020",
    checkerLight: "#1b2437",
  },
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
    "button-default": bar("/ui/kenney-ui-pack-sci-fi/PNG/Blue/Default/bar_round_small.png"),
    "button-hover": bar("/ui/kenney-ui-pack-sci-fi/PNG/Blue/Default/bar_round_gloss_small.png"),
    "button-active": bar(
      "/ui/kenney-ui-pack-sci-fi/PNG/Green/Default/bar_round_gloss_small.png",
      { textColor: "#f1ffec" },
    ),
    "button-critical": bar(
      "/ui/kenney-ui-pack-sci-fi/PNG/Red/Default/bar_round_gloss_small.png",
      { textColor: "#fff0f0" },
    ),
    "button-disabled": bar("/ui/kenney-ui-pack-sci-fi/PNG/Grey/Default/bar_round_small.png"),
    input: bar(
      "/ui/kenney-ui-pack-sci-fi/PNG/Grey/Default/bar_round_small.png",
      { textColor: "#e6ebf5", uppercase: false, padding: box(6, 12) },
    ),
    "input-focus": bar(
      "/ui/kenney-ui-pack-sci-fi/PNG/Blue/Default/bar_round_gloss_small.png",
      { textColor: "#e6ebf5", uppercase: false, padding: box(6, 12) },
    ),
    toolbar: bar(
      "/ui/kenney-ui-pack-sci-fi/PNG/Grey/Default/bar_round_large.png",
      { slice: 12, width: 12, padding: box(14, 20), uppercase: false },
    ),
    "card-home": card(
      "/ui/kenney-ui-pack-sci-fi/PNG/Blue/Double/button_square_header_large_rectangle.png",
      {
        slice: box(52, 24, 24, 24),
        width: box(26, 12, 12, 12),
        padHeader: box(0, 18, 0, 18),
        padBody: box(14, 18, 18, 18),
        headerTextColor: "#ffffff",
        bodyTextColor: "#2b3358",
      },
    ),
    "card-content": card(
      "/ui/kenney-ui-pack-sci-fi/PNG/Extra/Double/panel_glass_screws.png",
      {
        slice: box(28, 12, 12, 12),
        width: box(10, 12, 12, 12),
        padHeader: box(14, 16, 1, 16),
        padBody: box(6, 16, 15, 16),
        headerTextColor: "#444444",
        bodyTextColor: "#2b3358",
        headerUppercase: false,
        letterSpacing: "0",
      },
    ),
    "grid-outline": outline(
      "/ui/kenney-ui-pack-sci-fi/PNG/Grey/Default/bar_round_large.png",
      { slice: 12, width: 12 },
    ),
    "badge-default": bar(
      "/ui/kenney-ui-pack-sci-fi/PNG/Grey/Default/bar_round_small.png",
      { padding: box(2, 10), letterSpacing: "0.04em", uppercase: false },
    ),
  },
};

// -------------------------------------------------------------------------
// Merge / migrate (handles both v2 native and v1 flat legacy shape)
// -------------------------------------------------------------------------

export function mergeUiTheme(raw: unknown): UiTheme {
  const base = cloneTheme(DEFAULT_UI_THEME);
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Partial<UiTheme> & { roles?: Record<string, unknown> };
  if (obj.cursors && typeof obj.cursors === "object") {
    base.cursors.default = mergeCursor(base.cursors.default, (obj.cursors as Record<string, unknown>).default);
    base.cursors.pointer = mergeCursor(base.cursors.pointer, (obj.cursors as Record<string, unknown>).pointer);
  }
  if (obj.colors && typeof obj.colors === "object") {
    base.colors = mergeColors(base.colors, obj.colors);
  }
  if (obj.roles && typeof obj.roles === "object") {
    for (const id of UI_ROLE_ORDER) {
      const incoming = obj.roles[id];
      if (!incoming) continue;
      base.roles[id] = mergeRole(base.roles[id], incoming, ROLE_KIND[id]);
    }
  }
  return base;
}

function mergeColors(base: UiColorTokens, raw: unknown): UiColorTokens {
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  const next = { ...base };
  for (const id of UI_COLOR_ORDER) next[id] = color(obj[id], base[id]);
  return next;
}

function mergeRole(base: ChromeRole, raw: unknown, kind: RoleKind): ChromeRole {
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  // If the incoming entry already declares its kind matching ours, hydrate
  // straight from typed fields. Otherwise treat as legacy flat shape.
  const isNative = obj.kind === kind;
  if (kind === "bar") return hydrateBar(base as BarRole, obj, isNative);
  if (kind === "card") return hydrateCard(base as CardRole, obj, isNative);
  return hydrateOutline(base as OutlineRole, obj, isNative);
}

function hydrateBar(base: BarRole, obj: Record<string, unknown>, native: boolean): BarRole {
  return {
    kind: "bar",
    image: str(obj.image, base.image),
    slice: native
      ? num(obj.slice, base.slice)
      : firstNum(obj.slice, base.slice),
    width: native ? num(obj.width, base.width) : firstNum(obj.width, base.width),
    padding: parseBoxLegacy(obj.padding, base.padding),
    textColor: str(obj.textColor, base.textColor),
    fillColor: str(obj.fillColor, base.fillColor),
    uppercase: bool(obj.uppercase, base.uppercase),
    letterSpacing: str(obj.letterSpacing, base.letterSpacing),
  };
}

function hydrateCard(base: CardRole, obj: Record<string, unknown>, native: boolean): CardRole {
  return {
    kind: "card",
    image: str(obj.image, base.image),
    slice: parseBoxLegacy(obj.slice, base.slice),
    width: parseBoxLegacy(obj.width, base.width),
    padHeader: native
      ? parseBoxLegacy(obj.padHeader, base.padHeader)
      : parseBoxLegacy(obj.headerPadding, base.padHeader),
    padBody: native
      ? parseBoxLegacy(obj.padBody, base.padBody)
      : parseBoxLegacy(obj.bodyPadding, base.padBody),
    headerTextColor: str(obj.headerTextColor ?? obj.textColor, base.headerTextColor),
    bodyTextColor: str(obj.bodyTextColor, base.bodyTextColor),
    fillColor: str(obj.fillColor, base.fillColor),
    headerUppercase: bool(obj.headerUppercase ?? obj.uppercase, base.headerUppercase),
    letterSpacing: str(obj.letterSpacing, base.letterSpacing),
  };
}

function hydrateOutline(base: OutlineRole, obj: Record<string, unknown>, native: boolean): OutlineRole {
  return {
    kind: "outline",
    image: str(obj.image, base.image),
    slice: native ? num(obj.slice, base.slice) : firstNum(obj.slice, base.slice),
    width: native ? num(obj.width, base.width) : firstNum(obj.width, base.width),
    padding: parseBoxLegacy(obj.padding, base.padding),
    textColor: str(obj.textColor, base.textColor),
    fillColor: str(obj.fillColor, base.fillColor),
  };
}

function mergeCursor(base: UiCursorRole, raw: unknown): UiCursorRole {
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  return {
    image: str(obj.image, base.image),
    hotspot: Array.isArray(obj.hotspot) && obj.hotspot.length === 2
      ? [num(obj.hotspot[0], base.hotspot[0]), num(obj.hotspot[1], base.hotspot[1])]
      : [...base.hotspot],
  };
}

// -------------------------------------------------------------------------
// CSS application
// -------------------------------------------------------------------------

export function applyUiTheme(theme: UiTheme, root: HTMLElement = document.documentElement) {
  applyColors(root, theme.colors);
  for (const id of UI_ROLE_ORDER) applyRole(root, id, theme.roles[id]);
  setCursor(root, "default", theme.cursors.default, "default");
  setCursor(root, "pointer", theme.cursors.pointer, "pointer");
}

function applyColors(root: HTMLElement, colors: UiColorTokens) {
  for (const id of UI_COLOR_ORDER) {
    root.style.setProperty(`--ui-color-${kebab(id)}`, colors[id]);
  }
}

function applyRole(root: HTMLElement, id: UiChromeRoleId, role: ChromeRole) {
  const p = `--ui-${id}`;
  root.style.setProperty(`${p}-image`, cssUrl(role.image));
  if (role.kind === "card") {
    root.style.setProperty(`${p}-slice`, `${boxJoin(role.slice)} fill`);
    root.style.setProperty(`${p}-width`, boxPx(role.width));
    root.style.setProperty(`${p}-header-h`, `${role.slice.top}px`);
    root.style.setProperty(`${p}-pad-header`, boxPx(role.padHeader));
    root.style.setProperty(`${p}-pad-body`, boxPx(role.padBody));
    root.style.setProperty(`${p}-header-color`, role.headerTextColor);
    root.style.setProperty(`${p}-body-color`, role.bodyTextColor);
    root.style.setProperty(`${p}-bg`, role.fillColor);
    root.style.setProperty(`${p}-header-transform`, role.headerUppercase ? "uppercase" : "none");
    root.style.setProperty(`${p}-spacing`, role.letterSpacing);
    return;
  }
  if (role.kind === "bar") {
    root.style.setProperty(`${p}-slice`, `${role.slice} fill`);
    root.style.setProperty(`${p}-width`, `${role.width}px`);
    root.style.setProperty(`${p}-padding`, boxPx(role.padding));
    root.style.setProperty(`${p}-color`, role.textColor);
    root.style.setProperty(`${p}-bg`, role.fillColor);
    root.style.setProperty(`${p}-transform`, role.uppercase ? "uppercase" : "none");
    root.style.setProperty(`${p}-spacing`, role.letterSpacing);
    return;
  }
  // outline
  root.style.setProperty(`${p}-slice`, `${role.slice}`);
  root.style.setProperty(`${p}-width`, `${role.width}px`);
  root.style.setProperty(`${p}-padding`, boxPx(role.padding));
  root.style.setProperty(`${p}-color`, role.textColor);
  root.style.setProperty(`${p}-bg`, role.fillColor);
}

function setCursor(root: HTMLElement, id: "default" | "pointer", cursor: UiCursorRole, fallback: string) {
  root.style.setProperty(
    `--ui-cursor-${id}`,
    `${cssUrl(cursor.image)} ${cursor.hotspot[0]} ${cursor.hotspot[1]}, ${fallback}`,
  );
}

// -------------------------------------------------------------------------
// Asset loading + helpers
// -------------------------------------------------------------------------

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
    version: 2,
    colors: { ...theme.colors },
    cursors: {
      default: { image: theme.cursors.default.image, hotspot: [...theme.cursors.default.hotspot] },
      pointer: { image: theme.cursors.pointer.image, hotspot: [...theme.cursors.pointer.hotspot] },
    },
    roles: Object.fromEntries(
      UI_ROLE_ORDER.map((id) => [id, cloneRole(theme.roles[id])]),
    ) as Record<UiChromeRoleId, ChromeRole>,
  };
}

function cloneRole(role: ChromeRole): ChromeRole {
  if (role.kind === "card") {
    return {
      ...role,
      slice: { ...role.slice },
      width: { ...role.width },
      padHeader: { ...role.padHeader },
      padBody: { ...role.padBody },
    };
  }
  return { ...role, padding: { ...role.padding } };
}

// -------------------------------------------------------------------------
// CSS box / value helpers
// -------------------------------------------------------------------------

export function boxJoin(b: BoxValue): string {
  if (b.top === b.right && b.top === b.bottom && b.top === b.left) return `${b.top}`;
  if (b.top === b.bottom && b.right === b.left) return `${b.top} ${b.right}`;
  if (b.right === b.left) return `${b.top} ${b.right} ${b.bottom}`;
  return `${b.top} ${b.right} ${b.bottom} ${b.left}`;
}

export function boxPx(b: BoxValue): string {
  const j = boxJoin(b);
  return j.split(" ").map((n) => `${n}px`).join(" ");
}

export function parseBoxLegacy(raw: unknown, fallback: BoxValue): BoxValue {
  if (typeof raw === "number" && Number.isFinite(raw)) return box(raw);
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Partial<BoxValue>;
    return {
      top: num(obj.top, fallback.top),
      right: num(obj.right, fallback.right),
      bottom: num(obj.bottom, fallback.bottom),
      left: num(obj.left, fallback.left),
    };
  }
  if (typeof raw === "string") {
    const nums = raw
      .replace(/[a-z%]/gi, "")
      .split(/\s+/)
      .map((part) => Number.parseFloat(part))
      .filter((n) => Number.isFinite(n));
    if (nums.length === 0) return { ...fallback };
    const [a = 0, b = a, c = a, d = b] = nums;
    return { top: a, right: b, bottom: c, left: d };
  }
  return { ...fallback };
}

// -------------------------------------------------------------------------
// scalar helpers
// -------------------------------------------------------------------------

function cssUrl(url: string): string {
  return `url(${JSON.stringify(url).slice(1, -1)})`;
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
}

function color(value: unknown, fallback: string): string {
  return typeof value === "string" && /^(#[0-9a-f]{6}|transparent)$/i.test(value)
    ? value
    : fallback;
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function firstNum(raw: unknown, fallback: number): number {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const m = raw.match(/-?\d+(\.\d+)?/);
    return m ? Number.parseFloat(m[0]) : fallback;
  }
  return fallback;
}

function kebab(value: string): string {
  return value.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}
