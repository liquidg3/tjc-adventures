# AGENTS.md — start here

Guidance for any AI agent (or human) working in this repo. Keep it current: if
you learn something the hard way, write it down here or in the README so the
next agent doesn't repeat it.

## Orient yourself first
1. **[docs/STATE.md](./docs/STATE.md)** — ⭐ **READ FIRST.** Exact current state &
   where to pick up (repo map, current scene tunables, open punch list, next
   steps). No code archaeology needed.
2. **[README.md](./README.md)** — how to run, scripts, gotchas.
3. **[docs/](./docs/README.md)** — the design: `brief.md` (source of truth),
   `prototype-meadow-run.md` (the level, Raiden-inspired), `architecture.md`.

## Working agreements (please honor)
- **No private/agent memory for this project.** All knowledge goes in the repo
  (README, this file, `docs/`) so anyone can pick it up. Don't stash project
  facts in tool memory.
- **Design before technology.** Settle the *what/why* in `docs/` before reaching
  for tools or writing code.
- **`docs/brief.md` stays a clean declarative spec** — no Q&A or decision-log
  history; fold decisions into the relevant section.
- **Update the docs when you change things** so they never drift from reality.

## Gotchas that will bite you (full list in docs/STATE.md → Gotchas)
- **Level Builder DOM grid must stay virtualized.** The 2D grid uses row virtualization
  (`VIRTUAL_ROW_H = 20px`; only visible rows rendered). At 32 columns the current
  5-minute grid has 400 rows = 12,800 cells. Without virtualization, React reconciles
  all of them on every RAF tick. Keep `GridPanel` virtualized; any new grid-like
  surface must do the same.
- **Level Builder terrain texture should stay one texture.** The 3D authoring grid is
  repainted into one `DynamicTexture` with `uScale=vScale=1`; avoid GPU texture tiling
  for the grid because minified tiled dynamic textures tanked FPS in earlier passes.
  See `level-terrain-layer.ts`.
- **Async model-placement race — use generation counters.** `level-prop-layer.ts`
  uses fire-and-forget async placement (`void loadAndPlace(...)`).
  Without a generation counter, rapid calls produce orphan meshes in the scene that are
  never disposed. Pattern: `let generation = 0;` → `const gen = ++generation;` at call
  start → check `gen !== generation` before and after every `await`.
- **In-flight promise map prevents duplicate model loads.** `SceneLoader.ImportMeshAsync`
  adds ALL meshes to the scene permanently. If two concurrent calls both see
  `!modelCache.has(url)` before either adds to the cache, the model loads twice and the
  first load's meshes leak forever. Fix: a `loadingPromises: Map<string, Promise<void>>`
  sentinel — check it before starting a load, set it immediately, delete it on resolve.
- **WebGL context cap (~16/page).** Each Babylon `Engine` = one WebGL context;
  exceeding the cap kills the oldest and corrupts every engine on the page. Never
  create unbounded engines — see `apps/studio/src/viewer-budget.ts`.
- **Ship forward-yaw is player-only.** The runtime applies `SHIP_MODEL_FORWARD_YAW = π`
  to the player ship's model root so Kenney's −Z-nosed art faces +Z (the direction
  of travel). Do NOT bake this into enemies — they want the opposite facing
  (nose toward the player). See STATE.md → Gotchas for the full convention.
- **Bank/dodge roll signs must match** (both negative-on-input). The 180° yaw on
  the model swaps left/right relative to world; bank uses `-latFrac`, dodge uses
  `-dodgeDir`. New roll behaviours must use the same sign.
- **`ArcRotateCamera` vertical singularity.** Don't `setPosition` it perfectly
  overhead — drive top-down views via `alpha`/`beta` with `beta = 0.01`. See
  `viewer-scene.ts:applyCameraView`.
- **Kenney's UI tag is `tag:interface`** (not `tag:UI`). The catalog scraper
  paginates `tag:interface` to surface UI packs in the Asset Library.
- **`usePersistedJson<T>` is the canonical Studio persistence hook** — every
  new dev-endpoint-backed surface must use it; don't roll a parallel fetch +
  state dance. See `apps/studio/src/use-persisted-json.ts`. New JSON endpoints
  ride one `jsonFilePlugin(name, route, file)` factory in `vite.config.ts`.
- **9-slice math.** `slice` cuts source pixels; `border-image-width` is render
  pixels. `slice.top + slice.bottom ≤ source.height` (and same horizontally)
  or the middle goes negative → hollow centre on any element bigger than the
  source. Use the UI Builder `SlicePreview` middle-dim readout when picking.
  Kenney bars: small 96×16 = slice/width 8; large 96×24 = 12; Double large
  192×48 = source slice 24, render width 12.
- **Card-kind roles need `.studio-card-title` + `.studio-card-body` markup**
  so the title element can `min-height` the painted header band. Without
  that markup the role's `headerTextColor` has nothing to paint.
- **Bar-button selectors exclude `.studio-card` AND `.lb-cell`** — the base button rule
  is `button:not(.studio-card):not(.lb-cell)`. Grid paint cells are bespoke `<button>`
  elements that must never receive button chrome. Any new non-UI button must be added
  to the `:not()` chain or given an explicit exclusion.
- **`.btn-sm` works on `<a>` too** — the selector is `.btn-sm`, not `button.btn-sm`.
  Use it for compact buttons AND `<a>` links that should look like buttons (e.g. `.pack-link`).
  The design system is button-first: bare `<a>` links should pick up button chrome via
  being added to the base button rule (`.pack-link` is already there).
- **`assetValueToUrl(value)` is the canonical helper** in `asset-normalization.ts` —
  converts `"model:pack/name"` → `"/models/pack/name.glb"`. Do not re-implement inline.
- **Bar-button selectors exclude `.studio-card`** (`button:not(.studio-card)`).
  Studio's landing cards are `<button>` but want the card recipe. Any new
  bar-button rule must include the `:not()` clause.
- **`textColor` ≠ `fillColor`.** Text vs background-color, independent.
  Every button state CSS rule must set both vars explicitly.
- **Pixelation + screen-space math:** `setHardwareScalingLevel` changes render-buffer
  dims; do picking/clamp math in CSS-pixel space (`canvas.clientWidth`), not
  `getRenderWidth()`.
- **`colyseus` is CommonJS** — default-import it (`import colyseus from "colyseus"`),
  never named imports, or Node's ESM loader throws "no export named 'Room'".
- **Run npm scripts from the repo root**, not from inside a workspace (you'll get
  "Missing script"). Use `npm run dev:studio` / `dev:client` / `dev` (frees ports +
  boots), `npm run doctor` (pre-flight), `npm run free-ports`.
- **Phone join needs same WiFi** without AP isolation; scan the QR with the native
  camera app.

## Current focus
Tuning the look & flight feel of the **3D vertical-scroller**, through the **Studio**
(`npm run dev:studio`, :5174). The scene itself lives in **`packages/scenes/src/
ship-scene.ts`** (shared as `@tjc/scenes`) and is mounted by both the Studio tuner
(`apps/studio/src/VerticalScroller.tsx`) and the game client (`apps/game-client`,
route `/`). **See `docs/STATE.md`** for exact tunables, the `SceneHandle` contract,
the open punch list, and ordered next steps. The M0 multiplayer spine is built and
**parked** (`/host` + `/join`).

**Art direction = Kenney CC0 low-poly** (game) **+ Kenney UI Pack Sci-Fi**
(Studio chrome). Game art sourced exclusively from Kenney's CC0 3D kits via the
Studio's **Asset Library** (live browser + one-click Import). 3D packs land in
committed `apps/studio/public/models/`, UI packs in `apps/studio/public/ui/`.
Studio chrome (cards/buttons/inputs/cursors) is skinned via `border-image`
9-slice over Kenney sci-fi assets — see end-of-file block in `styles.css`.

**UI Builder** (`#ui`): maps imported UI-pack images to semantic Studio chrome
roles plus semantic system color tokens for shared Studio/editor chrome.
**Schema v2 — `colors` + discriminated role union by kind** (`bar | card |
outline`). Each role's editor panel only renders the controls for its kind, so
card knobs don't leak onto buttons. Card kind publishes `--ui-<role>-header-h`
(= source slice top) so title elements `min-height` to the band. v1 themes
auto-migrate on fetch. Persists to `apps/studio/ui-theme.json` via
`/__ui-theme`, live-applies CSS variables. Draft / Save / Revert / Reset.
Picker shows raw assets on a checkerboard. Broad color fixes belong in
`UiColorTokens` first; role color fields are for true per-role exceptions.
Color fields include an explicit `Transparent` toggle because native
`input[type=color]` cannot select alpha; use it for `fillColor` when 9-slice
middles should stay clear. System color fields render `UI_COLOR_HELP` usage
notes and a preview covering control surface/border/label/focus, selection,
and checkerboard tokens.
Adding a role = `UiChromeRoleId` + `ROLE_KIND` + `UI_ROLE_LABELS` +
`DEFAULT_UI_THEME` + CSS rule that reads `--ui-<id>-color / -image / -slice /
-width / -padding` + `renderExample` case. **Every new role CSS rule must
include `color: var(--ui-<id>-color, …)` — omitting it silently ignores the
color the user sets in the Builder.**
**Auto-commit on Save** — every POST to `/__ui-theme` triggers a git commit
via `gitAutoCommit` in `vite.config.ts`. Requires dev server restart after
config changes. Recovery: `git log --oneline apps/studio/ui-theme.json`.
**`btn-sm`** is the utility class for compact buttons. It overrides padding and
font-size only; image/colors inherit from the active button role. Do NOT add a
separate UI Builder role for size variants — 9-slice images scale to any size.
**No `!important` in `styles.css`** — use CSS specificity instead. The pattern
is `button.classname` (0,1,1) for overrides that need to beat the base
`button:not(.studio-card)` (0,1,1) rule. Never reach for `!important` when a
one-word specificity bump solves it.

**Vertical Shooter Level Builder** (`#level`): layered five-minute authoring
surface for terrain, objects, and height. It uses a v2 JSON schema, a virtualized
2D grid, live 3D preview, and filtered Terrain / Objects / Height / Erase modes.
Important current truth: runtime terrain preview is **in progress, not ready**.
Do not assume painted terrain is correctly becoming the authored ground until
Phase 4 in `docs/level-builder-plan.md` is actually complete.

## Where things live
- **Live scene (Babylon):** `packages/scenes/src/ship-scene.ts` → `@tjc/scenes`
- **Studio (tuner + Kenney asset tools):** `apps/studio` (:5174) — primary work
  surface. Asset Library (3D + UI import) · Asset Test (preview) · 3D Models
  board (assign) · Vertical Scroller (tune) · Level Builder (paint grid)
- **Game client (mounts the scene):** `apps/game-client` (:5173)
- **Production models (committed, CC0):** `apps/studio/public/models` (Kenney packs
  + `index.json`); `apps/game-client/public/models` is the scene's runtime copy — keep synced
- Game logic core (shared types): `packages/core`
- Server (Colyseus, parked): `apps/game-server`
- Helper scripts: `scripts/` (free-ports, clean, doctor, verify-spine, stage-pack)
