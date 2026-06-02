# STATE — pick up here (handoff)

> **Read this first.** It is the precise current state of the project so you can
> continue *exactly* where the last session stopped — no code archaeology, no
> relearnings. Design canon is in `docs/` (`brief.md`, `prototype-meadow-run.md`,
> `architecture.md`); how-to + gotchas in `README.md`; agent rules in `AGENTS.md`.
> **All knowledge lives in the repo — do not use private/agent memory.**

_Last updated: 2026-06-02._

---

## Where we are

- **Design:** fully specced and settled — `docs/brief.md` (source of truth) and
  `docs/prototype-meadow-run.md` (the "Meadow Run" level, inspired by _Raiden_).
- **Monorepo:** built and working (Lerna + npm workspaces). See `README.md` and
  `docs/architecture.md`.
- **M0 multiplayer spine:** done & verified, **PARKED**. Laptop hosts a Colyseus
  room; phones join via QR (`/host` + `/join` in `apps/game-client`). Not wired to
  the 3D game. `npm run verify:spine` exercises it headlessly.
- **ACTIVE WORK → the single-player 3D vertical-scroller, tuned through the
  Studio.** We are iterating the *look and flight feel* of the meadow scroller,
  decoupled from netcode/gameplay. Recent work: zones/climates, momentum + barrel
  roll, the asset tooling below, and (this session) the player ship is fully
  **gameplay-ready** — flies forward, banks into turns, the double-tap barrel
  roll is a real emergency juke (locked at 2.5×SHIP_SPEED for 0.28s, rolls
  toward the tapped direction).
- **ART DIRECTION → Kenney CC0 low-poly (committed decision).** All non-Kenney
  assets were removed — the old ~505 MB Sketchfab `src/models` library and the
  Synty experiment are gone. Game art now comes exclusively from Kenney's CC0 3D
  kits, browsed + one-click-imported in the Studio's **Asset Library**. See
  "Assets & art direction" below. **Imported so far:** `kenney-nature-kit` (329
  models), `kenney-space-kit` (153).
- **Player ship is Kenney** (`craft_racer` from kenney-space-kit, via
  `asset-map.json`). `scene-config.DEFAULT_SHIP_MODEL_URL` still points at the
  legacy `ship_classic.glb` as the cold-start default, but `VerticalScroller`
  fetches `asset-map.json` and immediately swaps in the Kenney ship — the legacy
  one only appears for the ~50 ms before that fetch resolves. Scenery is still
  the last legacy holdout (`tree_fur`, `bush`, `rocks_small`, `tree_stylized`).
- **ACTIVE: Studio UI Builder (rewritten this session — v2 schema).** `#ui`
  maps imported UI-pack images onto semantic chrome roles, persists to
  `apps/studio/ui-theme.json`, and live-applies CSS variables. The schema is
  now split into **semantic system color tokens** plus a **discriminated union
  by chrome kind**:
    - `colors` — shared UI decisions for text, muted text, panel headings/body,
      editor control labels/borders/surfaces, focus, selection, status, and
      checkerboard preview colors. Use these for broad Studio/editor color
      fixes; don't add ad hoc component color knobs unless a role genuinely
      needs a per-role exception.
    - `kind: "bar"` — buttons, inputs, toolbars, badges. Single uniform slice,
      `padding`, `textColor`, `fillColor`, `uppercase`, `letterSpacing`.
    - `kind: "card"` — Home cards, slot cards, side panels. Per-edge slice
      (T R B L); **the source image's top slice IS the header band height**,
      published as `--ui-<role>-header-h` and consumed by `.studio-card-title`
      `min-height` so titles land in the band exactly. Separate `padHeader`
      and `padBody`, `headerTextColor` / `bodyTextColor`, `headerUppercase`.
    - `kind: "outline"` — Level Builder grid frame: same slice but no `fill`,
      transparent middle.
  Each role's editor panel only renders the controls for its kind, so card
  knobs no longer leak onto buttons. Auto-migration from v1 flat shape
  preserves user picks. Asset picker auto-clamps slice on image change via
  `suggestSliceForImage(url, kind)` so a new image doesn't immediately yield a
  "middle = 0×0" garbage state. `SlicePreview` shows source dims + computed
  middle dims and red-flags overlapping edges. Roles list: 11 entries; `Content
  card` is the single role for both content cards and side-panel chrome, and
  `button-critical` covers red destructive buttons.
  Draft / Save / Revert / Reset confirmation; raw assets shown on a
  checkerboard (not inside themed chrome) so the user sees the actual source.
  The left rail starts with **System colors** before role-specific editors.
  Color fields support an explicit `transparent` toggle because native
  `<input type="color">` cannot select transparency; this matters most for
  `fillColor`, which paints behind transparent 9-slice middles. Each system
  color field shows a plain-language "where this appears" note, and the
  System colors preview demonstrates control surface/border/label/focus,
  selection, and checkerboard tokens.
- **NEW THIS SESSION → UI Builder chrome polish pass.** Several gaps closed:
  - **`input-focus` role** added (12th role, `bar` kind) — controls the 9-slice
    border shown on focused `<input>`, `<select>`, and `<textarea>` elements.
    Previously hardcoded to blue gloss; now fully themeable image/slice/width/color.
  - **`select` elements** now strip native OS appearance (`appearance: none`) and
    show a CSS inline-SVG triangle on the right. They match input height exactly.
  - **`btn-sm` utility class** replaces `.ui-transparent-toggle`. Add `btn-sm` to
    any `<button>` for a compact size; the role image/colors inherit automatically.
  - **All `!important` removed** from `styles.css` (was 11 instances). Fixed by
    raising specificity on the low-specificity selectors (`.confirm-accept`,
    `.critical`, `.lb-reset` → `button.` prefix) and removing ones that were
    genuinely unnecessary (`.studio-card` is already excluded by
    `:not(.studio-card)`; `input[type=range]` already wins on specificity;
    `.ui-asset-tile.raw` already wins; `.ui-slice-info-bad` wins by file order).
  - **Missing `color:` vars wired** — `.badge`, `.lb-grid`, `.ui-preview-grid`,
    `input:focus` all now read their role's `--ui-*-color` CSS variable. Previously
    the UI Builder let you change these text colors but nothing consumed them.
  - **`header h1 / p / code`** wired to `--ui-color-focus`, `--ui-color-text-muted`,
    `--ui-color-warning` tokens so the UI Builder title and `bar`/`card`/`outline`
    code spans respond to the system color editor.
  - **Auto-commit on Save** — `jsonFilePlugin` accepts an optional `onWrite`
    callback; the `ui-theme` endpoint passes one that runs
    `git add … && git commit` immediately after writing. Every Save = one git
    commit (`chore(studio): auto-save ui-theme.json`). Restart dev:studio to
    pick up Vite config changes.
  - **Preview panel overflow fixed** — cursor `<select>` dropdowns in the right
    column no longer bleed outside the card boundary (`overflow: hidden` +
    `min-width: 0` on `.ui-preview-panel`; `width: 100%` on child selects/inputs).
- **Studio landing reorganized this session.** Home now groups cards: Universal
  Tools (3D Models / Asset Library / Asset Test / UI Builder) and one section
  per game mode (Vertical Shooter, Side Scroller [coming soon], Death Race
  [coming soon]). Per-mode each has the same two cards: **Test Play** (was
  "Vertical Scroller") and **Level Builder**. Adding a new game mode = adding a
  `SectionGroup` entry in `Home.tsx`.
- **NEW THIS SESSION → Vertical Shooter Level Builder (v1, authoring only).**
  Studio section at `#level`. Paints a 24×80 grid of `{prop?, height?}` cells
  (5 world units per cell), persists to `apps/studio/level-builder.json` via
  `/__level-builder`. Palette = env/prop/terrain slots that have a model
  assigned in the 3D Models board. **The scene does NOT read this yet** — that
  wiring is the next iteration after you verify the editor feels right.
- **NEW THIS SESSION → Asset Library expanded to 3D + UI packs.** Library
  filter chips: All / 3D / UI. UI uses Kenney's `tag:interface` (not `tag:UI`
  — that returns nothing). UI imports stage to `apps/studio/public/ui/kenney-<slug>/`
  preserving the pack's `PNG/Default/`, `Vector/` etc. structure; 3D stays in
  `public/models/`. Same one-click import.
- **NEW THIS SESSION → Studio chrome restyled with Kenney UI Pack Sci-Fi.** All
  cards, buttons, inputs, cursors now use 9-sliced `bar_round_*` and composite
  `button_square_header_*_rectangle` images via CSS `border-image`. See
  `apps/studio/src/styles.css` end-of-file block "KENNEY UI PACK SCI-FI" for
  the anatomy diagram and class mapping.

## The one thing that changed structurally (don't trip on the old layout)

**The live scene is no longer inside `apps/game-client`.** It now lives in a
shared package and is imported by both apps:

- `packages/scenes/src/ship-scene.ts` — ★ **the composition root** for the Babylon
  vertical-scroller scene.
- `packages/scenes/src/{scene-config,lighting-controller,flight-controller,ship-controller,prop-field,ground-texture,ship-materials}.ts`
  — the runtime controllers and helpers the scene is now built from.
- Exported as **`@tjc/scenes`** (`packages/scenes/src/index.ts`).
- Consumed by **`apps/studio/src/VerticalScroller.tsx`** (the tuner — primary
  surface) and **`apps/game-client/src/GameSandbox.tsx`** (route `/`).

The Studio is where you tune; the game-client just mounts the same scene.

## Run it

```bash
npm install
npm run doctor          # pre-flight (node, deps, ports)
npm run dev:studio      # STUDIO  → http://localhost:5174  ← tune the scene here (primary)
npm run dev:client      # GAME    → http://localhost:5173  (same scene at /, no panels)
npm run dev             # full multiplayer (server :2567 + client; /host + /join) — parked
```

Dev servers auto-open the browser. `npm run free-ports` if a port is stuck.
**Run npm scripts from the repo root** — running `npm run dev:studio` from inside
`apps/studio` fails ("Missing script") because that's the *root* script name.

---

## Repo map (so you don't have to explore)

```
packages/scenes/
  src/ship-scene.ts        ★ composition root for the Babylon vertical-scroller scene (@tjc/scenes)
  src/scene-config.ts      scene constants, presets, exported types, SceneHandle contract
  src/flight-controller.ts ship movement + camera-bank runtime controller
  src/ship-controller.ts   player ship load/swap/scale/shadow/material controller
  src/lighting-controller.ts sun/sky/shadow preset + live sun controls
  src/prop-field.ts        prop scatter + recycling controller
  src/ground-texture.ts    procedural meadow painter
  src/ground-layer.ts      one scrolling ground (style/tile + scroll + clip); the scene runs two for climate wipes
  src/zone-sequencer.ts    scroll-distance track of zones; climate boundaries drift in at scroll speed, lighting cross-fades
  src/ship-materials.ts    model loading + imported-material normalization
  src/debug.ts             flaggable logging: dbg()/dbgWarn()/dbgError(); on in dev or with ?debug
  src/index.ts             re-exports ship-scene

apps/studio/               ★ THE TUNER + ASSET TOOLS (port 5174) — primary surface
  src/Home.tsx             launcher cards → models | assets | asset-test | ui | vertical | level (+ side/race soon)
  src/App.tsx              section router (Home ↔ a section)
  src/AssetLibrary.tsx     ★ Kenney pack browser (3D + UI): filter chips, live thumbnails, one-click Import
  src/AssetTest.tsx        single shared 3D viewer — rotating isometric browse view; auto-applies kit preset
  src/ModelsBoard.tsx      3D Models board: assign a staged model + normalization preset to each game slot → asset-map.json
  src/SlotCard.tsx         one slot: dropdown + preset select + expanded modal draft/save normalization workflow
  src/ModelPreview.tsx     budgeted orbit preview (grid card = beauty view, expanded modal = 2x2 alignment grid)
  src/LevelBuilder.tsx     ★ NEW: paint scenery + height onto a 24×80 grid (v1 authoring only)
  src/level-builder-state.ts Level types + emptyLevel/mergeLevel/cellIndex helpers
  src/UiBuilder.tsx        ★ NEW: assign imported UI images to semantic chrome roles → ui-theme.json;
                             draft/save, raw asset grid, slice preview, card header/body padding
  src/ui-theme-state.ts    UI theme schema, defaults, asset loader, CSS variable applier
  src/use-persisted-json.ts ★ shared "mirror a Studio JSON endpoint" hook — used by ModelsBoard, LevelBuilder
  src/asset-normalization.ts preset registry + asset-map parsing/serialization helpers + model overrides
  src/viewer-scene.ts      createViewer(): orbit-preview engine (GLB load + optional shared-atlas + setOrient)
  src/viewer-budget.ts     caps live WebGL contexts at 6 — leased by ModelPreview (Asset Test uses ONE shared viewer)
  src/models.ts            loadStagedModels(): reads imported packs from public/models (index.json + manifests)
  src/slots.ts             the game asset slots (Ships/Animals/Environment/…)
  src/VerticalScroller.tsx the scene + tuning panels (zone / camera / ship / ground / lighting / scenery / pixel);
                           now reads asset-map + normalization presets so the live ship matches the 3D Models board
  src/vertical-scroller-state.ts reducer + persisted defaults + deep-link hash; the zone list lives here
  src/styles.css           full Studio CSS — ends with a Kenney UI Pack Sci-Fi block that skins controls
                             via ui-theme CSS variables + border-image 9-slice; anatomy diagram inline
  public/models/           PRODUCTION 3D (committed CC0): kenney-<pack>/*.glb + manifest.json, index.json;
                             plus legacy ships/ + environment/ the scene still loads (pending the swap)
  public/ui/               ★ NEW: PRODUCTION UI (committed CC0): kenney-<pack>/PNG/<Color>/Default/*.png +
                             Vector/*.svg + manifest.json, index.json. Currently has ui-pack + ui-pack-sci-fi
                             (the latter is what skins the Studio chrome).
  vite.config.ts           dev endpoints (JSON-mirror routes share one jsonFilePlugin factory):
                             /__asset-map, /__vertical-defaults, /__asset-normalization-{presets,overrides},
                             /__level-builder, /__ui-theme; plus /__kenney/{list,meta,import}
  asset-map.json           committed slot→model assignments
  asset-normalization-presets.json   committed shared normalization baselines
  asset-normalization-overrides.json committed per-model normalization overrides
  level-builder.json       committed level grid (24×80 cells) — written by the Level Builder section
  ui-theme.json            committed Studio chrome theme — image role mapping + slices/padding/text

apps/game-client/          Vite + React (port 5173)
  src/GameSandbox.tsx      mounts @tjc/scenes on a canvas (route /)
  src/main.tsx             routes: / = sandbox, /host = Host lobby, /join = Controller (phone)
  src/Host.tsx / Controller.tsx / colyseus.ts   M0 multiplayer spine (parked)
  public/models/{ships,environment}/  the scene's runtime models for this app

apps/game-server/          Colyseus authoritative server (parked); GameRoom + GameState
apps/marketing/            stub
packages/core/             shared TS types (Role, JoinOptions, ROOM_NAME, ports)
packages/ui|assets|config/ stubs (assets = intended future home for game art)
scripts/                   free-ports, clean, doctor, verify-spine, stage-pack (manual pack staging), gen-grass-tiles
docs/                      brief.md (canon), prototype-meadow-run.md (the level), architecture.md, this file
```

---

## The scene — `packages/scenes/src/ship-scene.ts`

A tilted 2.5D vertical scroller (Raiden-style). `createShipScene(canvas)` returns a
**`SceneHandle`** — the full runtime contract the tuner drives:

```
dispose, setCameraRotationMode, setShipHeight, setShipSize, getShipPosition,
resetShip, setGroundStyle, setPixelScale, setLightingPreset,
setSunIntensity, setSkyIntensity, setSunAzimuth, setSunElevation, getLightingState,
setLevelPlan, getZoneStatus, setScenery  (+ setGroundTile, setPipelineMode, setRtHeight, ship-light setters)
```

**Structure after the refactor:**

- `ship-scene.ts` is now the composition root, not the implementation dump.
- `flight-controller.ts` owns ship movement, viewport clamp math, and camera bank.
- `ship-controller.ts` owns player ship load/swap/size/shadow/material state,
  including runtime model normalization (orient/anchor/offset) under a pivot.
- `lighting-controller.ts` owns sun/sky/shadow preset math and live sun controls.
- `prop-field.ts` owns scatter/recycle behavior for environment props.
- `ground-texture.ts` owns the procedural meadow painter.
- `ship-materials.ts` owns imported-model loading and material normalization.
- `ground-layer.ts` is one scrolling ground; the scene runs two so a climate can
  wipe in across the field via a moving clip seam.
- `zone-sequencer.ts` runs a `LevelPlan` as a scroll-distance track.

**Zone plan (level sequencer).** `setLevelPlan({ zones })` runs an auto-scrolling
track: the ship advances at `SCROLL`, each zone (climate) occupies `lengthSec` of
travel, and zone boundaries are marks on the track that map to a world-Z and drift
toward the camera **at scroll speed** — a boundary is a real line you fly through,
drawn by clipping a second `ground-layer` to the far side of the seam. Lighting
cross-fades as the seam crosses the field. `getZoneStatus()` reports the current
zone; pass `null` to return to manual control. In the Studio, the **Zone Plan**
panel owns the zone list, and the **selected zone is mirrored into the live look**
so the existing **Ground**, **Lighting**, **Ship Lighting**, and **Scenery**
panels edit it (no duplicate controls) — ground, sun lighting, ship (PBR) lighting,
and scenery are all per-zone and cross-fade as the climate seam crosses the field.
Zones persist in `vertical-defaults.json` (`blendSec` is vestigial — the
transition speed is the scroll speed). Default plan = Meadow → Woodland → Canyon →
Approach (see `docs/prototype-meadow-run.md`). While a plan plays the sequencer
owns ground + lighting; the manual panels drive the scene only when stopped.

**Current tunables (constants at the top of the file):**

| Const | Value | Meaning |
|---|---|---|
| `SHIP_SPEED` | `50` | units/s lateral + forward |
| `BOOST_MULT` | `2.2` | Shift = boost (unlimited for now) |
| `SCROLL` | `16` | units/s the field moves toward camera |
| `FIELD_DEPTH` | `800` | scroll-field length (large so nothing pops in under the camera tilt) |
| `SHIP_HEIGHT` | `100` | default cruising altitude (also the board-clamp plane); `export` |
| `SHIP_SIZE` | `2.3` | default ship target height in world units; `export` |
| `SHIP_START_Z` | `50` | starting depth, clear of the bottom edge |
| `SHIP_BANK_MAX` | `0.4` | visual roll when steering hard |
| `CAMERA_BASE_LOCAL_X` | `-0.3` | default tilt-back so more field is visible ahead |
| `CAMERA_TEST_ROT` | `0.35` | exaggerated camera-rotation test amount |
| `CAMERA_Z_ROT` | `0.02` | subtle head-lean for the current default bank axis |
| `CAMERA_ROT_LERP` | `4` | eases camera/rig rotation |

**Current scene behavior:**

- **Camera:** `FreeCamera` parented under a `cam-rig` `TransformNode` so bank can be
  tested by rotating the camera child or the rig. 7 runtime modes
  (`CameraRotationMode`: `none`, `camera-x/y/z`, `rig-x/y/z`); default **`camera-z`**
  (closest-feeling bank), with a *small* tilt. Smoothed via `CAMERA_ROT_LERP`.
- **Ship:** `/models/ships/ship_classic.glb`, fit to `SHIP_SIZE`, starts at
  `(0, SHIP_HEIGHT, SHIP_START_Z)`, banks on turns.
- **Movement / bounds:** Arrows/WASD, Shift boost, `P` pixel toggle. **Momentum**:
  velocity eases toward input (`SHIP_ACCEL`), so steering builds speed and
  releasing coasts; bank + camera-lean follow the smoothed velocity.
  **Double-tap left/right = barrel-roll dodge** (`DODGE_DURATION`/`DODGE_DASH`,
  detected in `input-controller.ts`; rolls `rotation.z` + a lateral burst — hook
  for i-frames once projectiles exist). **X and Z are clamped to the visible
  viewport** by projecting the ship to screen space and raycasting into its flight
  plane. **This math runs in CSS-pixel space (`canvas.clientWidth/Height`), NOT
  `getRenderWidth()`** — see the pixelation gotcha below.
- **Scenery (per climate):** `prop-field.ts` runs one instance pool per model
  (bush/rock/tree_fur/tree_stylized); each climate sets a per-model density and
  the pool shows props whose fixed random rank is under it, re-evaluated only at
  the far edge so scenery streams in with the ground seam (no mid-field pop).
- **Ground:** `CreateGround 1200×1000` at `z=400` (wide enough that fullscreen
  doesn't show the left/right edges). Procedural meadow `DynamicTexture` 512px
  (trilinear + mips). 4 `GroundStyle`s: `painterly`, `flat`, `stripes`, `checker`.
  `vOffset` scroll rate is matched to prop speed using the live `vScale`.
- **Scenery (scatter + scroll):** mixed trees `tree_fur` ×12 + `tree_stylized` ×12
  (height **24** — recently shrunk from 120; fly-over for now), `rocks_small` ×30
  (h3). Full-width placement incl. the center lane; recycled past `z < -40` to
  `+FIELD_DEPTH`.
- **Lighting:** a `DirectionalLight` (sun) + `HemisphericLight` (sky fill).
  5 `LightingPreset`s (`noon`/`golden`/`overcast`/`dramatic`/`moonlit`) set
  sun/sky color+intensity, clear color, shadow darkness. **Live sun controls**:
  intensity, sky-fill intensity, and sun **azimuth + elevation** (the tuner derives
  azimuth/elevation from a preset so the sliders track it; nudge from there).
  **Current default starting point:** `dramatic`, sun **2.8**, sky **0.20**,
  angle **110°**, height **84°**.
- **Shadow:** real `ShadowGenerator` (2048, `useBlurExponentialShadowMap`,
  `blurKernel 48`); `ground.receiveShadows = true`; ship is a shadow caster.
  **The old "blob shadow disc" is gone** — this is a true projected, blurred shadow
  that no longer clips through the ground when banking.
- **Pixelate:** `engine.setHardwareScalingLevel(level)` (Off/2×/3×/4×). `P` toggles.
- **Debug:** `[TJC]` console logs via `packages/scenes/src/debug.ts` (dev / `?debug`).

## The Studio tuner — `apps/studio/src/VerticalScroller.tsx`

Live panels around the canvas (all **collapsed by default**; click a header to open):

- **Zone Plan** (the level's ordered climates; selecting a zone mirrors it into the
  Ground/Lighting/Ship-Lighting/Scenery panels so they edit *that* zone)
- **Ship Size** (slider) · **Ship Position** (live x/y/z readout + "Reset to start")
- **Camera Rotation** (the 7 modes) · **Ship Altitude** (slider)
- **Ground** (4 styles) · **Lighting** (5 presets + Sun / Sky / Angle / Height sliders)
- **Ship Lighting** (PBR) · **Scenery** (per-model density) · **Pixelate** (Off / 2× / 3× / 4×)

Each panel maps to a `SceneHandle` method. The Ship-Position readout is how QE
reports good coordinates back; that's why `getShipPosition`/`resetShip` exist.

## The 3D Models board — `apps/studio/src/ModelsBoard.tsx`

Assign a real model to each game asset slot. **Assignments persist to the committed
`apps/studio/asset-map.json`** via the dev server's `/__asset-map` GET/POST endpoint
(`assetMapPlugin` in `vite.config.ts`); localStorage is a fast fallback. The game
will read this map later. Dropdown options come from `loadStagedModels()` — every
model in the imported Kenney packs under `public/models` (the old `src/models`
`import.meta.glob` is gone). Import packs from the **Asset Library** first.

**Normalization now lives here too.** Each slot assignment also carries a
**normalization preset** so the chosen model can be made game-ready at selection
time, not later in Asset Test. Current presets:

- `none`
- `kenney-space-kit`
- `kenney-nature-kit`

The grid card preview is the lightweight beauty view:
- rotating isometric camera
- mouse interaction enabled
- no gizmos

The expanded modal is the real alignment tool:
- 2×2 grid: `Top`, `Front`, `Side`, `Iso`
- side-panel tuning controls
- draft-only edits until saved
- actions:
  - `Reset Draft`
  - `Save Preset`
  - `Save For Model`
  - `Clear Model Override`
- confirmations are in-app UI, not browser `confirm()`

Persistence model:
- `asset-normalization-presets.json` = shared kit baseline
- `asset-normalization-overrides.json` = model-specific exceptions

Important unresolved bug:
- the preview/reference tooling and the runtime scene are still not fully aligned
  on ship forward. A ship can look correct against the preview forward indicator
  and still fly backward in the vertical scroller. Treat this as a
  runtime-vs-preview convention mismatch, not as a tuning mistake.

The asset map supports both the old string form and the new object form:

```json
"ship-player": "model:kenney-space-kit/craft_racer"
```

or:

```json
"ship-player": {
  "model": "model:kenney-space-kit/craft_racer",
  "preset": "kenney-space-kit"
}
```

---

## Assets & art direction (Kenney CC0)

**Decision:** all game art comes from **Kenney's CC0 3D kits** (kenney.nl). We ditched
the earlier mixed Sketchfab library (~505 MB, sometimes broken GLBs) and a brief Synty
experiment (FBX with dead Windows `.psd` texture paths). Kenney models are
vertex-colored, self-contained, Y-up — no atlas wrangling, no orientation fixes, tiny,
license-clean to commit.

**Other CC0 sources to revisit** (parked — we're on Kenney for now, but worth a look
if we want more variety or a complementary style):
- **Quaternius** — https://quaternius.com/index.html — free CC0 low-poly model packs,
  same spirit as Kenney (a strong candidate if Kenney's kits don't cover something).
- Also on the radar: **Poly Pizza** (ex-Google Poly), **Sketchfab** (filter to CC0/CC-BY).

**The pipeline (all in the Studio):**
1. **Asset Library** (`/assets`) — live browser of every Kenney 3D pack. The dev server
   scrapes kenney.nl (`/__kenney/list` paginates `category:3D`; `/__kenney/meta?slug=`
   finds each pack's preview + zip). Each card's one-click **Import** →
   `POST /__kenney/import?slug=` downloads the zip, `unzip`s it, copies the GLBs (and
   only textures a GLB actually references — not Kenney's preview PNGs) into
   `public/models/kenney-<slug>/`, writes `manifest.json`, and appends the pack to
   `public/models/index.json`. Cards show "✓ imported" for staged packs.
2. **Asset Test** (`/asset-test`) — one shared 3D viewer (single WebGL context) to
   preview any staged model as a rotating isometric browse view. Kits start
   collapsed. The viewer auto-applies the matching preset by kit.
3. **3D Models board** (`/models`) — assign a staged model to each game slot → `asset-map.json`.
4. **`scripts/stage-pack.mjs`** — manual equivalent of Import for a local pack folder;
   assimp-converts OBJ/FBX if a pack ships those instead of GLB.

**Where assets live:** `apps/studio/public/models/` — **committed** (CC0). Layout:
`kenney-<pack>/*.glb` + `manifest.json` per pack, plus top-level `index.json`
(`{"packs":[…]}`). **Imported so far:** `kenney-nature-kit` (329), `kenney-space-kit`
(153). The game-client has its own `public/models` to sync when the scene's runtime
models change.

**Still legacy (pending the scene swap):** `public/models/ships/ship_classic.glb` and
`public/models/environment/{bush,rocks_small,tree_fur,tree_stylized}.glb` — the *only*
non-Kenney files left, kept because `packages/scenes` still loads them
(`DEFAULT_SHIP_MODEL_URL`, `SCENERY_MODELS` in `scene-config.ts`). Swapping these to
Kenney is the next task (below).

---

## Open punch list (what's NOT done)

**Look & feel (in active QE tuning):**
1. **Lighting** — current default starting point is now `dramatic` with sun **2.8**,
   sky **0.20**, angle **110°**, height **84°**. QE should tune from there; once
   it feels locked, consider trimming the slider panel.
2. **Pixelation** — hardware-scaling pixelation (the current approach) reads as
   *blurry*, not retro/charming, per QE. If none of Off/2×/3×/4× satisfy, the real
   fix is the **low-res render-target + nearest-neighbor + palette** pipeline
   described in `architecture.md` §6 — not hardware scaling.
3. **Ground** — QE verdict: `flat` grass is best *only* because it hides the tiling;
   `painterly` has the best texture but the tiles are obvious. Procedural is just for
   picking a direction — **source a real seamless CC0 ground texture** once a look is
   chosen (Kenney/Poly Haven).
4. **Bank feel** — `camera-z` (subtle) is the current keeper; confirm, then optionally
   remove the Camera Rotation panel.
5. **Trees** are now small fly-over props; real **dodging/obstacle collision** is
   deferred to gameplay.

**Art pipeline:**
6. **Scene still runs legacy models.** The runtime scene loads `ship_classic` +
   the four `environment/` props (the last non-Kenney files). **The swap to Kenney
   models is the #1 next step** (see below) — pick a Space-Kit ship + Nature-Kit
   scenery in the **3D Models board**, repoint `scene-config.ts`, delete the legacy
   files, then sync `apps/game-client/public/models`.
7. **Kenney kits are big catalogs, not curated sets.** `nature-kit` is 329 models,
   `space-kit` 153 — most won't be used. Curate the handful the scene actually needs
   via the 3D Models board; no `gltfpack` pass is needed (Kenney GLBs are already
   tiny and vertex-colored).

**Gameplay (not started — pilot-flight only):**
8. No shooting / enemies / pickups / rescue / cages yet. Roles (Gunner, Spotter) are
   designed in `docs/` and the **M0 spine exists but is parked** — neither is wired
   into the scene. **No auto-fire** (kids own the shooting).
9. **Raiden pickup mechanics** (weapon medals → upgrades, bombs) — adapt later per
   `prototype-meadow-run.md`.

## Suggested next steps (in order)

1. **Finish the UI Builder pass.** `#ui` now edits `ui-theme.json` with draft/save,
   raw asset grid, source slice preview, role presets, card header/body padding,
   and live CSS variable application. Next polish: add image dimensions/metadata
   to asset tiles, group/filter assets by kind (chrome vs icon buttons vs parts vs
   cursors), add per-role presets for Kenney UI families, and migrate any remaining
   one-off hardcoded chrome selectors into the role map.
2. **Wire the Level Builder grid into the scene.** v1 only persists; nothing
   reads it. Make `prop-field.ts` consult the grid before falling back to its
   random scatter. Cell-to-world: `worldX = (col - width/2) * cellSize`,
   `worldZ-from-zone-start = (depth - row) * cellSize`, `worldY = height *
   HEIGHT_NUDGE`. Slot id → asset-map → URL. Then add a ground-mesh height
   pass that displaces vertices by interpolated cell height (bilinear). Once
   wired, the editor becomes a real authoring loop.
3. **Enemies — start the gameplay layer.** `asset-map.json` already has
   `ship-enemy = kenney-space-kit/craft_miner` but nothing spawns. First pass:
   simple straight-line enemies streaming down-screen, no shooting yet — give
   the player something to use the freshly-tuned dodge on. Per
   `prototype-meadow-run.md`. (When you spawn enemies, remember they face the
   **opposite** way to the player — they should look toward the player, so do
   NOT apply `SHIP_MODEL_FORWARD_YAW` to them; that constant is player-only.)
4. **Finish the Kenney scenery swap.** The scene still loads the last legacy
   `/models/environment/{bush,rocks_small,tree_fur,tree_stylized}.glb` props.
   Pick Kenney nature-kit replacements via the 3D Models board, repoint
   `scene-config.SCENERY_MODELS`, delete the legacy files, sync
   `apps/game-client/public/models`. (Scenery doesn't need a forward-yaw — only
   ships have a front.)
5. **Shooting** — wire projectiles from the player ship's nose (the Gunner
   role); enemies become real targets.
6. Lock the **look**: settle lighting + ground direction; decide if
   hardware-scaling pixel stays or the low-res-RT pipeline
   (`architecture.md` §6) is needed; bake into defaults.
7. Continue **gameplay** — pickups, **rescue cages**, the **Warden** boss — per
   `docs/prototype-meadow-run.md`.
8. **Reconnect multiplayer** (roles across devices) per `docs/architecture.md`.

---

## Gotchas (already hit — don't relearn)

- **WebGL context cap (~16/page).** Each Babylon `Engine` = one WebGL context. The
  3D Models board renders one engine per card, so a full board exceeded the cap, the
  browser dropped the oldest contexts, and **every** engine on the page died
  ("Unable to create texture / vertex buffer / uniform buffer", blank screen).
  Fixed by `apps/studio/src/viewer-budget.ts` (hard cap of **6** leased slots) +
  `ModelPreview.tsx` lazy-mounting an engine only while the card is on screen
  (IntersectionObserver). **Never create unbounded Babylon engines on one page.**
  The **Asset Test** screen sidesteps the cap entirely with ONE shared viewer that
  recreates its engine on model-select — preview any pack size at one context.
- **Pixelation breaks screen-space math if you use render-buffer dims.**
  `setHardwareScalingLevel(n)` shrinks the render buffer to 1/n, and Babylon's
  `createPickingRay` *also* divides input coords by the hardware-scaling level — so
  using `getRenderWidth()` for the ship's nav clamp shrank the playable box by `n`.
  **Do clamp/picking math in CSS-pixel space (`canvas.clientWidth/Height`).**
- **`colyseus` must be default-imported** (`import colyseus from "colyseus"`), never
  named — Node ESM can't see its named exports.
- **`@babylonjs/loaders` must match core (pinned `^7.x`)** — 8.x breaks peer deps
  against `@babylonjs/core` 7.x.
- **glTF PBR models render dark without an HDR/IBL** — force materials matte
  (`metallic=0`) so the lights catch them, or add an environment texture.
- **Don't drive `engine.resize()` from a `ResizeObserver` on the canvas** — it feeds
  back and oscillates. Use the window `resize` event.
- **Ship forward-yaw convention (player only).** Kenney space-kit ships are
  modeled nose-toward −Z (glTF native). Gameplay-forward in the scroller is +Z
  (away from camera, up the field). The artist aligns the model's nose to the
  preview's gold arrow (+Z) in the 3D Models modal, and the runtime applies
  `SHIP_MODEL_FORWARD_YAW = π` to the **visual model root inside the ship pivot**
  — see `packages/scenes/src/ship-controller.ts`. Applied to the root (not the
  pivot) so the pivot's bank/roll axis stays world-Z and the bank math
  doesn't have to change. **Don't reuse this constant for enemies** — they need
  the opposite facing (nose toward the player).
- **Bank/dodge roll signs must match.** Because the 180° yaw lives on the
  model root, the world-X side that ends up on the *observer's* right is the
  model's native left. The regular bank uses `-latFrac * SHIP_BANK_MAX`
  (negative coefficient on the input) and the dodge uses
  `-dodgeDir * Math.PI * 2 * eased` — same sign convention. If you ever add a
  new roll behaviour (e.g. a Spotter ping), use the same sign or it'll spin the
  wrong way. See `packages/scenes/src/flight-controller.ts`.
- **ArcRotateCamera vertical singularity.** Don't position an `ArcRotateCamera`
  perfectly overhead with `setPosition(target + (0, r, 0))` — `rebuildAnglesAndRadius`
  throws inside `Vector3.TransformCoordinatesToRef` for that degenerate vector.
  In `apps/studio/src/viewer-scene.ts:applyCameraView` we drive all four views
  by `alpha`/`beta`/`radius` instead, with the top pane using `beta = 0.01` to
  sit just off straight-down.
- **Dodge velocity must bypass momentum easing.** The `velX` easing immediately
  bleeds off any one-shot burst, so the dodge has to *lock* `velX` for the
  duration (see `flight-controller.ts` — `if (dodgeTimer > 0) { velX = … }`
  short-circuits the normal `velX += (target − velX) * accel`). Without that
  lock it reads as "a small nudge," not an emergency juke.
- **Kenney's UI tag is `tag:interface`, not `tag:UI`.** When scraping
  kenney.nl for UI packs, `tag:UI` returns nothing — Kenney consistently uses
  `interface` for the broader UI category. See `vite.config.ts:scrapeKenneyList`.
- **Kenney sci-fi card anatomy** (`button_square_header_*_rectangle`, 192×64):
  blue header band (~22–28 px tall) + grey body + screw row (~6–8 px) along the
  bottom. Use `border-image-slice: 26 12 12 12 fill` (T R B L) so the header
  height stays sharp while the body stretches. For the `Double` (2×) variants,
  scale slice values 2× (`52 24 24 24 fill`). `bar_round_*` (96×16/24) is a
  horizontal pill — slice/width 8 for small, 12 for large; Double large
  (192×48) uses source slice 24 with render width 12. **Slice values vs source
  pixels matter** — guessing gives stretched corners and edge seams.
- **UI Builder kind-aware schema** (v2 this session). Roles are now a
  discriminated union: `bar | card | outline`. Each kind exposes only the
  knobs that make sense for it (bar gets single slice + padding; card gets
  per-edge slice + padHeader/padBody + split header/body text colors; outline
  gets slice without `fill`). v1 flat themes auto-migrate to v2 in memory at
  fetch time and persist back as v2 on first Save. **Adding new chrome roles:**
  extend `UiChromeRoleId` + `ROLE_KIND` + `UI_ROLE_LABELS` + `DEFAULT_UI_THEME`,
  add a CSS rule consuming the new vars, and (if needed) a `case` in
  `renderExample(id, label)`.
- **9-slice math constraints**: `slice.top + slice.bottom ≤ source.height`
  and `slice.left + slice.right ≤ source.width`. Whatever's left is the body
  band that stretches. If the sum overshoots, the middle is negative px → the
  browser paints transparency through it, which reads as a hollow centre on
  any element bigger than the source. `SlicePreview` now shows source dims +
  computed middle dims and red-flags overlap. **Picking an image** also runs
  `suggestSliceForImage(url, kind)` — a filename heuristic that pre-fills
  reasonable slice values for the Kenney sci-fi families so a fresh image
  doesn't start broken. For 16px-tall bars at slice 8, the centre is exactly
  0px tall — use a taller source (`bar_round_large` = 24px) or set `fillColor`
  on the role to paint a solid behind the transparent band. If a 24px-tall
  large bar shows thin edge seams, check for a stale small-bar slice (`8`);
  large bars need `12`, and Double large bars need source slice `24`.
- **`border-image-slice` ≠ `border-image-width`**. Slice is how many SOURCE
  pixels to cut from each edge. Width is how many RENDER pixels those edges
  occupy. When `width ≠ slice` the corners scale (compressed or stretched)
  and look different from the source middle stretching. Visible at any size
  that isn't exactly the source dimensions. To make a bar look honest at any
  element size: set `width = slice` so corners render at native source size.
- **Card title element drives the header band, not padding-top.** The
  `.studio-card-title` element has `min-height: var(--ui-<role>-header-h)` so
  its outer box exactly fills the painted header band. The body wrapper
  (`.studio-card-body`) sits below with its own padding. **Adding a header
  band to a new component** = wrap its title in `<span class="studio-card-title">`
  and the rest in `<div class="studio-card-body">`. Without the title
  element, the header role's `headerTextColor` has nothing to apply to.
- **`button:not(.studio-card)` selectors.** The Studio's Home landing cards
  are `<button>` for clickability but they want the headered-card recipe, not
  the bar-button recipe. Every bar-button rule (`button:hover`, `:active`,
  `:disabled`, `.on`, `.critical`) excludes `.studio-card` via `:not()` so
  cards keep their Kenney sci-fi panel. **Adding a new bar-button rule** =
  include the `:not(.studio-card)` clause.
- **`textColor` vs `fillColor`**. `textColor` → CSS `color` (foreground text);
  `fillColor` → CSS `background-color` (the box behind the text, visible
  wherever the border-image's middle is transparent). Two independent
  properties; setting one doesn't imply the other. Every button state rule
  must explicitly set both vars (the `:disabled` and `:hover` rules were
  missing `color` for a stretch — fixed this session). **Body text colour
  on content-card themed side panels also requires removing hardcoded `color:` rules on direct
  descendants** (e.g. `.studio-card-desc` had a hardcoded `#9fb5d3` that
  overrode the themed body colour; it's now stripped so the cascade wins).
  If a button shows a squared-off color block, check that role's `fillColor`;
  set it to `transparent` unless the source image truly needs a solid middle.
- **Headings inside themed panels need an explicit override.** The bare
  `h1, h2, h3 { color: #d5e3ff; }` rule wins by specificity inside any
  themed container. The explicit override at the end of `styles.css` lists
  every content-card themed panel container (`preview-sidepanel`, `preset-editor`,
  `confirm-box`, `lb-palette`, `asset-stage`, `asset-list`, the three UI
  Builder columns) and points their headings at
  `--ui-card-content-header-color`. **Add new panel-themed surfaces to that
  list** if you want their headings to honour the role.
- **UI Builder columns ARE themed by content-card.** The role list / editor /
  examples columns ride `card-content` so tuning that role affects them too.
  This is meta-chrome (editor styling itself with the role being edited),
  intentional — the user wants visual consistency. **Don't strip the theming
  back to flat** unless asked.
- **Pack-card markup quirk**: Asset Library pack cards reorder to put the
  title BEFORE the thumb so the title lands in the header band. The thumb
  uses `width: calc(100% + 32px); margin: 0 -16px` to mirror the card-head's
  `-16px` sideways pull and align with the card frame. The `-16` is
  hardcoded to the current `card-content.padBody` left/right; if that
  changes, the thumb needs a matching var or it'll misalign.
- **Level Builder data shape**: 24 wide × 80 deep grid, row-major, row 0 = far
  end of zone (top of screen at runtime), cellSize = 5 world units. Per cell
  `{ prop?: slotId, height?: 0..3 }`. See `level-builder-state.ts`. v1 persists
  only — the scene doesn't read this yet (see Next Steps #1).
- **Studio JSON endpoints all share one factory** — `jsonFilePlugin(name,
  route, file)` in `vite.config.ts`. Add a new endpoint with one line +
  matching file constant. The Studio JSONs (asset-map, vertical-defaults,
  both normalization files, level-builder, ui-theme) all ride this.
- **`usePersistedJson<T>` is the canonical Studio autosave persistence hook** —
  `apps/studio/src/use-persisted-json.ts`. GET on mount, POST on update,
  returns `{value, setValue, saved, loaded}`. Use it for autosaving JSON-backed
  surfaces. `UiBuilder` intentionally does a local draft + explicit Save/Revert
  flow so a bad chrome experiment does not immediately overwrite `ui-theme.json`.
- **No `React.StrictMode`** — double-invoked effects would start Babylon/rooms twice.
- **Run npm scripts from the repo root.** `dev:studio`, `dev:client`, etc. are root
  scripts; running them inside a workspace dir errors with "Missing script".
- **Asset import = Studio, not scripts.** Use the **Asset Library**'s one-click
  Import (Kenney, over the network) or `node scripts/stage-pack.mjs <dir> <name>`
  (local folder). The old `convert-models`/`import-models` scripts and the 505 MB
  `src/models` library they built are **deleted** — don't look for them.
- **Where models live:** **committed** under each app's `public/models` (served at
  `/models/**`). The Studio's 3D Models board + Asset Test read
  `apps/studio/public/models` via `index.json` → per-pack `manifest.json` (no
  `import.meta.glob`). The scene loads from the app it runs in
  (`apps/game-client/public/models`), so **keep the two `public/models` in sync**
  when scene-runtime models change.
- **Kenney GLBs are vertex-colored (no texture images)** — they render correctly
  flat-shaded; don't expect PBR atlases. Import copies only referenced textures, so
  Kenney's preview PNGs are (correctly) skipped.
- **Ports:** server **2567**, game client **5173**, Studio **5174**.
</content>
