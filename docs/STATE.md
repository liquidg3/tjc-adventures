# STATE — pick up here (handoff)

> **Read this first.** It is the precise current state of the project so you can
> continue *exactly* where the last session stopped — no code archaeology, no
> relearnings. Design canon is in `docs/` (`brief.md`, `prototype-meadow-run.md`,
> `architecture.md`); how-to + gotchas in `README.md`; agent rules in `AGENTS.md`.
> **All knowledge lives in the repo — do not use private/agent memory.**

_Last updated: 2026-06-06 (session 4)._

---

## Where we are

- **Design:** fully specced and settled — `docs/brief.md` (source of truth) and
  `docs/prototype-meadow-run.md` (the "Meadow Run" level, inspired by _Raiden_).
- **Monorepo:** built and working (Lerna + npm workspaces). See `README.md` and
  `docs/architecture.md`.
- **M0 multiplayer spine:** done & verified, **PARKED**. Laptop hosts a Colyseus
  room; phones join via QR (`/host` + `/join` in `apps/game-client`). Not wired to
  the 3D game. `npm run verify:spine` exercises it headlessly.
- **ACTIVE WORK → the Level Builder.** We are building out the five-minute authored
  level for the vertical scroller through the Studio. The Level Builder is now a
  substantial authoring surface: v2 layered schema (terrain/height/objects), live 3D
  preview with terrain and object layers, smart connected terrain painting, performance
  optimizations, and a polished UI. See `docs/level-builder-plan.md` for the phase-by-phase
  status.
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
- **Studio landing:** Home groups cards into Universal Tools (3D Models / Asset
  Library / Asset Preview / UI Builder) and one section per game mode (Vertical
  Shooter, Side Scroller [coming soon], Death Race [coming soon]). Per-mode each
  has **Test Play** and **Level Builder** cards.
- **Studio chrome:** skinned with Kenney UI Pack Sci-Fi via CSS `border-image`
  9-slice. `apps/studio/src/styles.css` (end-of-file block "KENNEY UI PACK SCI-FI")
  drives all cards, buttons, inputs. The **UI Builder** (`#ui`) maps images to
  semantic chrome roles + system color tokens, persisting to `apps/studio/ui-theme.json`.

---

## Level Builder — current state (the active surface)

The Level Builder was refactored into focused modules in session 4. It is the primary work surface going forward.

**Module split (SOLID refactor — done)**
- `level-builder-types.ts` — `PaintMode` + `PAINT_MODES`
- `level-panels.tsx` — `LevelPanel`, `PaintPanel`, `PreviewPanel`, `ColumnChangeConfirm`
- `level-palette.tsx` — `PalettePanel`, `formatModelLabel`
- `level-grid.tsx` — `GridPanel` + memoized `GridCell` (virtualized)
- `LevelBuilder.tsx` — ~795 lines of core state, paint/erase/rotate logic, scene wiring

### What is working

**Data model (v2 layered schema)**
- `level-builder-state.ts` holds `TerrainCell`, `TerrainFeatureCell`, `PlacedObject`,
  `HeightCell`, `ObjectCell`, `LevelLayers`, `Level`. The v2 schema stores separate
  `terrain`, `height`, and `objects` arrays per level.
- `TerrainCell` has an optional `feature` (connected feature intent: family, shape,
  rotation, modelId, fallback flag) and an optional `rotation` (manual non-feature rotation).
- `PlacedObject` has an optional `rotation` (yaw degrees).
- Migration from v1 `{prop?, height?}` JSON runs on load.

**Modes and palette**
- Three paint modes: `Terrain`, `Objects`, `Height`.
- Each mode has its own eraser (toggle button in the palette panel; erases only that
  layer). **There is no separate "Erase" top-level mode** — erasing is a per-mode toggle.
- Terrain mode has a **Manual / Connected** sub-mode selector.
  - Manual: left-click same model cycles rotation 0→90→180→270; places new model otherwise.
  - Connected: paint a feature family (River by default); neighbor mask drives shape + rotation.
- Right-clicking any cell rotates both the terrain and the object in that cell simultaneously.
- Object mode has palette search input and kit dropdown ("All kits" + per-kit filter).
- Brush shape: `free` (drag stroke) or `rect` (drag to fill rectangle).
- A **Rebuild Connections** button re-resolves all non-manual feature cells.
- Fallback count badge shows how many cells fell back to a non-exact shape.

**Smart terrain painting (Phase 6 — complete)**
- `terrain-connectivity.ts`: `terrainMaskForCell`, `terrainShapeForMask`, full 16-entry
  shape/rotation table (4-bit N/E/S/W mask → `{shape, rotation}`).
- `terrain-feature-resolver.ts`: `buildTerrainFeatureLookup`, `resolveTerrainFeatureModel`
  (camelCase-tokenized tiebreaker), `resolveTerrainFeatureFallback` (plan fallback chains),
  `availableFeatureFamilies`.
- Paint operations use functional `setLevel(prev => ...)` updaters so rapid drag never
  drops intermediate writes.
- Erasing a connected cell recomputes same-family neighbors.

**Model catalog fixes**
- `path_stone` / `path_wood` are classified as objects (not terrain).
- `wood` models added to the nature category.
- Space kit: terrain models use `terrain_*` prefix for detection.
- Dungeon kit: terrain models use `floor` prefix for detection.

**Texture import fix**
- `scripts/stage-pack.mjs`: GLB relative-path `Textures/colormap.png` is now preserved
  during pack staging (was previously broken, dropping texture references).

**3D preview**
- `level-terrain-layer.ts` renders a scrolling grid of terrain GLBs; one `DynamicTexture`
  paints the authored grid color as a fallback / editor surface.
- Terrain cell `rotation` is applied in the scene via `LevelTerrainCell.rotation`;
  `level-terrain-layer.ts` passes `−rotation×π/180` on the Y axis.
- `level-prop-layer.ts` places objects at their grid world positions; applies
  `node.addRotation(0, -deg*PI/180, 0)` for `PlacedObject.rotation` (same
  negative-Y convention as the terrain layer — matches Babylon.js `rotationQuaternion`
  path and avoids the `.rotation.y` conflict).
- Object scale uses name-category inference from `SLOT_PLACEMENT_SCALE` in
  `level-prop-layer.ts`: trees use `{min:22, cell:2.4}`; default unknown `{min:8, cell:1.0}`.
- Catalog model values (`"model:pack/name"`) are resolved to URLs via `assetValueToUrl`.
- `projectObjectsToLegacyCells` passes `rotation` from `PlacedObject` into the legacy
  `LevelGridCell` shape the prop layer consumes.

**UI and panels (all in LevelBuilder.tsx)**
- `LevelPanel` — title + FPS readout + autosave indicator.
- `PaintPanel` — mode dropdown + brush shape dropdown (free/rect) + Clear button.
- `PalettePanel` — search input + kit dropdown + eraser button + model tiles.
- `PreviewPanel` — play/pause + scrub slider.
- `GridPanel` — virtualized 2D grid (React.memo + per-cell primitives + stable
  useCallback via `actionRef`); 600 → 1 re-renders per paint operation.
- Layout: `lb-page` fixed full-viewport; scene canvas fills the background; left
  panel = paint/palette tools; right panel = preview controls + grid.

**Asset Preview**
- `AssetTest.tsx` renamed to `AssetPreview` (export name + H1 heading).
- Home card updated to "Asset Preview".

### What is still open (punch list for next agent)

1. **Terrain full-rebuild on every edit.** `level-terrain-layer.ts` rebuilds all
   terrain meshes on every `setLevelTerrainCells` call. No diff-based update yet.
3. **Height does not displace terrain in the 3D view.** Height layer paints the
   grid overlay and affects object Y placement, but terrain mesh vertices are not
   displaced.
4. **Object rotation direction may need tuning.** Negative Y matches the terrain
   layer convention; needs visual verification in the 3D preview.
5. **Enemies don't spawn.** `asset-map.json` has `ship-enemy = craft_miner` but
   nothing in the scene spawns enemies yet.
6. **Scenery uses legacy `/models/environment/` GLBs.** `scene-config.SCENERY_MODELS`
   still references `tree_fur`, `bush`, `rocks_small`, `tree_stylized`. Needs swap
   to Kenney nature-kit models.
7. **Rotation visual verification.** The `SHAPE_TABLE` in `terrain-connectivity.ts`
   assumes Kenney river models are authored N-S-straight at rotation=0, N+E-corner
   at rotation=0. See `VISUAL INSPECTION REQUIRED` comment in that file. Load the
   five base river models in Asset Preview and update the table if wrong.
8. **M0 multiplayer spine is parked.** No active work needed; it still runs via
   `npm run verify:spine`.

---

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
  src/ship-scene.ts          ★ composition root for the Babylon vertical-scroller scene (@tjc/scenes)
  src/scene-config.ts        scene constants, presets, exported types, SceneHandle contract
  src/flight-controller.ts   ship movement + camera-bank runtime controller
  src/ship-controller.ts     player ship load/swap/scale/shadow/material controller
  src/lighting-controller.ts sun/sky/shadow preset + live sun controls
  src/prop-field.ts          prop scatter + recycling controller
  src/ground-texture.ts      procedural meadow painter
  src/ground-layer.ts        one scrolling ground (style/tile + scroll + clip); the scene runs two for climate wipes
  src/zone-sequencer.ts      scroll-distance track of zones; climate boundaries drift in at scroll speed, lighting cross-fades
  src/level-prop-layer.ts    ★ Level Builder object placement layer — generation counters, in-flight promise map, SLOT_PLACEMENT_SCALE
  src/level-terrain-layer.ts ★ Level Builder terrain mesh layer — DynamicTexture grid + GLB tiles + rotation; full-rebuild on every edit
  src/ship-materials.ts      model loading + imported-material normalization
  src/debug.ts               flaggable logging: dbg()/dbgWarn()/dbgError(); on in dev or with ?debug
  src/index.ts               re-exports ship-scene

apps/studio/               ★ THE TUNER + ASSET TOOLS (port 5174) — primary surface
  src/Home.tsx               launcher cards → models | assets | asset-preview | ui | vertical | level (+ side/race soon)
  src/App.tsx                section router (Home ↔ a section)
  src/AssetLibrary.tsx       ★ Kenney pack browser (3D + UI): filter chips, live thumbnails, one-click Import
  src/AssetPreview.tsx       single shared 3D viewer — rotating isometric browse view; auto-applies kit preset
  src/ModelsBoard.tsx        3D Models catalog: curate imported models, usage tags, and normalization
  src/SlotCard.tsx           selected-model normalization editor reused by the catalog detail panel
  src/ModelPreview.tsx       budgeted orbit preview (grid card = beauty view, expanded modal = 2x2 alignment grid)
  src/LevelBuilder.tsx       ★ ~795-line core: state, paint/erase/rotate logic, scene wiring
  src/level-builder-types.ts PaintMode type + PAINT_MODES constant (shared across Level Builder modules)
  src/level-panels.tsx       LevelPanel, PaintPanel, PreviewPanel, ColumnChangeConfirm
  src/level-palette.tsx      PalettePanel (search, kit filter, eraser, terrain/object/height tiles)
  src/level-grid.tsx         GridPanel (virtualized) + memoized GridCell (per-cell primitives, stable handlers)
  src/level-builder-state.ts Level v2 types + migration/projection + emptyLevel/mergeLevel/cellIndex helpers
  src/terrain-connectivity.ts 4-bit neighbor mask, terrainMaskForCell, terrainShapeForMask, SHAPE_TABLE
  src/terrain-feature-resolver.ts buildTerrainFeatureLookup, resolveTerrainFeatureFallback, availableFeatureFamilies
  src/model-catalog.ts       inferModel, inferTerrainFamily, SLOT_PLACEMENT_SCALE; path_stone/path_wood=objects; space=terrain_*; dungeon=floor
  src/UiBuilder.tsx          ★ assign imported UI images to semantic chrome roles → ui-theme.json
  src/ui-theme-state.ts      UI theme schema, defaults, asset loader, CSS variable applier
  src/use-persisted-json.ts  ★ canonical autosave hook with functional updater support via valueRef.current
  src/asset-normalization.ts preset registry + asset-map parsing/serialization helpers + model overrides
  src/viewer-scene.ts        createViewer(): orbit-preview engine (GLB load + optional shared-atlas + setOrient)
  src/viewer-budget.ts       caps live WebGL contexts at 6 — leased by ModelPreview (Asset Preview uses ONE shared viewer)
  src/models.ts              loadStagedModels(): reads imported packs from public/models (index.json + manifests)
  src/slots.ts               legacy game asset slots, still read for compatibility/runtime holdouts
  src/VerticalScroller.tsx   the scene + tuning panels (zone / camera / ship / ground / lighting / scenery / pixel);
                             now reads asset-map + normalization presets so the live ship matches the 3D Models board
  src/vertical-scroller-state.ts reducer + persisted defaults + deep-link hash; the zone list lives here
  src/styles.css             full Studio CSS — ends with a Kenney UI Pack Sci-Fi block that skins controls
                               via ui-theme CSS variables + border-image 9-slice; anatomy diagram inline
  public/models/             PRODUCTION 3D (committed CC0): kenney-<pack>/*.glb + manifest.json, index.json;
                               plus legacy ships/ + environment/ the scene still loads (pending the swap)
  public/ui/                 PRODUCTION UI (committed CC0): kenney-<pack>/PNG/<Color>/Default/*.png +
                               Vector/*.svg + manifest.json, index.json. Currently has ui-pack + ui-pack-sci-fi
  vite.config.ts             dev endpoints (JSON-mirror routes share one jsonFilePlugin factory):
                               /__asset-map, /__vertical-defaults, /__asset-normalization-{presets,overrides},
                               /__level-builder, /__ui-theme; plus /__kenney/{list,meta,import}
  model-catalog-overrides.json committed catalog curation overrides (usage/category/family/shape)
  asset-map.json             legacy committed slot→model assignments, still read for old/runtime paths
  asset-normalization-presets.json   committed shared normalization baselines
  asset-normalization-overrides.json committed per-model normalization overrides
  level-builder.json         committed layered Level Builder JSON — written by the Level Builder section
  ui-theme.json              committed Studio chrome theme — image role mapping + slices/padding/text

apps/game-client/          Vite + React (port 5173)
  src/GameSandbox.tsx        mounts @tjc/scenes on a canvas (route /)
  src/main.tsx               routes: / = sandbox, /host = Host lobby, /join = Controller (phone)
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
setLevelPlan, getZoneStatus, setScenery,
setLevelCells, setLevelTerrainCells, setLevelScrollPaused, getLevelScrollZ, getFps
(+ setGroundTile, setPipelineMode, setRtHeight, ship-light setters)
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
- `level-prop-layer.ts` places authored Level Builder objects at grid world positions.
- `level-terrain-layer.ts` places authored terrain tiles as GLB meshes + a
  DynamicTexture fallback grid.

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

---

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

Curate every imported model from `public/models/*/manifest.json`. The old
slot-assignment UI is gone from this page; fixed game slots in `asset-map.json`
are now treated as legacy compatibility/runtime data, not the model-management
surface. Import packs from the **Asset Library** first, then use this page to
filter by kit/theme/category, tag model usage, and tune normalization.

**Catalog curation persists to `apps/studio/model-catalog-overrides.json`.**
Derived model data comes from imported manifests + inference in
`apps/studio/src/model-catalog.ts`; the override file stores only designer
edits such as usage flags (`terrain`, `object`, `rescueAnimal`, ships) and
category/family/shape corrections.

**Normalization lives here too.** The selected catalog model uses the same
normalization preset/override system as before, so any imported model can be
made game-ready at selection time. Current presets: `none`, `kenney-space-kit`,
`kenney-nature-kit`.

The grid card preview is the lightweight beauty view (rotating isometric camera,
mouse interaction enabled, no gizmos). The expanded modal is the real alignment
tool (2×2 grid: Top/Front/Side/Iso; side-panel tuning; draft-only edits until
saved; Reset Draft / Save Preset / Save For Model / Clear Model Override).

Persistence model:
- `asset-normalization-presets.json` = shared kit baseline
- `asset-normalization-overrides.json` = model-specific exceptions

Important unresolved bug:
- the preview/reference tooling and the runtime scene are still not fully aligned
  on ship forward. A ship can look correct against the preview forward indicator
  and still fly backward in the vertical scroller. Treat this as a
  runtime-vs-preview convention mismatch, not as a tuning mistake.

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
   only textures a GLB actually references — including relative-path `Textures/colormap.png`
   now preserved by `stage-pack.mjs`) into `public/models/kenney-<slug>/`, writes
   `manifest.json`, and appends the pack to `public/models/index.json`.
2. **Asset Preview** (`/asset-preview`) — one shared 3D viewer (single WebGL context) to
   preview any staged model as a rotating isometric browse view. Kits start
   collapsed. The viewer auto-applies the matching preset by kit.
3. **3D Models board** (`/models`) — catalog-only imported-model management:
   kit/theme/category filters, usage checkboxes, and one selected-model
   normalization preview. Legacy slot assignment is intentionally not shown.
   Catalog overrides persist to `apps/studio/model-catalog-overrides.json`.
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
Kenney is a pending task.

---

## Open punch list (what's NOT done)

**Level Builder (active work):**
1. **Terrain full-rebuild on every edit** — `level-terrain-layer.ts` does not diff;
   every `setLevelTerrainCells` call rebuilds all terrain meshes.
3. **Height does not displace terrain in the 3D view** — height layer affects object Y
   but terrain mesh vertices are not displaced.
4. **Object rotation direction may need tuning** — negative Y matches terrain layer
   convention; verify visually in the 3D preview.
5. **Rotation visual verification** — see `VISUAL INSPECTION REQUIRED` comment in
   `terrain-connectivity.ts`; load five river models in Asset Preview and confirm
   the `SHAPE_TABLE` assumptions.
6. **path / road family curation** — types and lookup are ready; models need to be
   curated in the 3D Models board and marked for terrain use.
7. **Minimap / jump-to-row** — current-position indicator for long levels is still missing;
   the active row can scroll offscreen with no way to jump back.

**Art pipeline:**
8. **Scene still runs legacy models** — `scene-config.SCENERY_MODELS` loads the four
   non-Kenney `environment/` props. Swap to Kenney nature-kit replacements, delete
   legacy files, sync `apps/game-client/public/models`.

**Gameplay (not started — pilot-flight only):**
9. No shooting / enemies / pickups / rescue / cages yet. `asset-map.json` has
   `ship-enemy = craft_miner` but nothing spawns. Roles (Gunner, Spotter) are
   designed in `docs/` and the **M0 spine exists but is parked**.
10. **Raiden pickup mechanics** (weapon medals → upgrades, bombs) — adapt later per
    `prototype-meadow-run.md`.

## Suggested next steps (in order)

1. **Terrain rotation visual verification** — load the five base river models in
   Asset Preview, check orientation vs. the `SHAPE_TABLE` in `terrain-connectivity.ts`,
   update the table if wrong.
3. **Path / road family** — curate path models in the 3D Models board, mark them for
   terrain use, verify the Connected brush works end-to-end.
4. **Diff-based terrain updates** — replace the full-rebuild in `level-terrain-layer.ts`
   with a diffed update so painting terrain is fast at 150+ rows.
5. **Height displacement** — apply painted height to terrain mesh vertices in the 3D
   preview so the elevation layer has visible effect.
6. **Legacy scenery swap** — pick Kenney nature-kit replacements for the scene's four
   `environment/` props, repoint `scene-config.SCENERY_MODELS`, delete the legacy
   files, sync `apps/game-client/public/models`.
7. **Enemies — start the gameplay layer.** `asset-map.json` already has
   `ship-enemy = kenney-space-kit/craft_miner` but nothing spawns. First pass:
   simple straight-line enemies streaming down-screen, no shooting yet. Per
   `prototype-meadow-run.md`. (When spawning enemies, do **NOT** apply
   `SHIP_MODEL_FORWARD_YAW` — enemies need the opposite facing.)
8. **Shooting** — wire projectiles from the player ship's nose (the Gunner role);
   enemies become real targets.
9. Continue **gameplay** — pickups, **rescue cages**, the **Warden** boss — per
   `docs/prototype-meadow-run.md`.
10. **Reconnect multiplayer** (roles across devices) per `docs/architecture.md`.

---

## Gotchas (already hit — don't relearn)

- **WebGL context cap (~16/page).** Each Babylon `Engine` = one WebGL context. The
  3D Models board renders one engine per card, so a full board exceeded the cap, the
  browser dropped the oldest contexts, and **every** engine on the page died
  ("Unable to create texture / vertex buffer / uniform buffer", blank screen).
  Fixed by `apps/studio/src/viewer-budget.ts` (hard cap of **6** leased slots) +
  `ModelPreview.tsx` lazy-mounting an engine only while the card is on screen
  (IntersectionObserver). **Never create unbounded Babylon engines on one page.**
  The **Asset Preview** screen sidesteps the cap entirely with ONE shared viewer that
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
- **Object rotation in `level-prop-layer.ts` uses `node.addRotation(0, -deg*PI/180, 0)`,
  NOT `node.rotation.y`.** Direct `.rotation.y` assignment conflicts with
  Babylon.js's `rotationQuaternion` path and produces wrong results. Use
  `addRotation` for any model loaded through `SceneLoader.ImportMeshAsync`.
- **Terrain rotation convention:** `LevelTerrainCell.rotation` is degrees CW from
  above; `level-terrain-layer.ts` applies `−rotation×π/180` on the Y axis.
  This matches the object rotation sign so both layers rotate the same way.
- **Level Builder DOM grid must stay virtualized.** The 2D grid uses row
  virtualization (`VIRTUAL_ROW_H = 20px`; only visible rows rendered). At 32
  columns the five-minute grid has 400 rows = 12,800 cells. Without
  virtualization React reconciles all of them on every RAF tick. Keep `GridPanel`
  virtualized; any new grid-like surface must do the same.
- **Level Builder terrain texture should stay one texture.** The 3D authoring
  grid is repainted into one `DynamicTexture` with `uScale=vScale=1`; avoid GPU
  texture tiling for the grid because minified tiled dynamic textures tanked FPS
  in earlier passes. See `level-terrain-layer.ts`.
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
- **UI Builder kind-aware schema (v2).** Roles are a discriminated union:
  `bar | card | outline`. Each kind exposes only the knobs that make sense for it.
  v1 flat themes auto-migrate to v2 in memory at fetch time and persist back as v2
  on first Save. **Adding new chrome roles:** extend `UiChromeRoleId` + `ROLE_KIND`
  + `UI_ROLE_LABELS` + `DEFAULT_UI_THEME`, add a CSS rule consuming the new vars,
  and (if needed) a `case` in `renderExample(id, label)`.
- **9-slice math constraints**: `slice.top + slice.bottom ≤ source.height`
  and `slice.left + slice.right ≤ source.width`. Whatever's left is the body
  band that stretches. If the sum overshoots, the middle is negative px → the
  browser paints transparency through it, which reads as a hollow centre on
  any element bigger than the source. `SlicePreview` shows source dims +
  computed middle dims and red-flags overlap.
- **`border-image-slice` ≠ `border-image-width`**. Slice is how many SOURCE
  pixels to cut from each edge. Width is how many RENDER pixels those edges
  occupy. When `width ≠ slice` the corners scale (compressed or stretched).
  To make a bar look honest at any element size: set `width = slice` so corners
  render at native source size.
- **Card title element drives the header band, not padding-top.** The
  `.studio-card-title` element has `min-height: var(--ui-<role>-header-h)` so
  its outer box exactly fills the painted header band. **Adding a header band to
  a new component** = wrap its title in `<span class="studio-card-title">` and
  the rest in `<div class="studio-card-body">`.
- **`button:not(.studio-card):not(.lb-cell)` is the base button selector.** Grid
  paint cells (`lb-cell`) are bespoke `<button>` elements that must never receive
  button chrome. Any new non-UI button added to the page must be excluded via
  `:not()` or given an explicit exclusion rule.
- **Bar-button selectors exclude `.studio-card`** (`button:not(.studio-card)`).
  Studio's landing cards are `<button>` but want the card recipe. Any new
  bar-button rule must include the `:not()` clause.
- **`textColor` vs `fillColor`**. `textColor` → CSS `color` (foreground text);
  `fillColor` → CSS `background-color`. Two independent properties; every button
  state rule must explicitly set both vars.
- **Headings inside themed panels need an explicit override.** The bare
  `h1, h2, h3 { color: #d5e3ff; }` rule wins by specificity inside any themed
  container. The explicit override at the end of `styles.css` lists every
  content-card themed panel container and points their headings at
  `--ui-card-content-header-color`. Add new panel-themed surfaces to that list.
- **No `React.StrictMode`** — double-invoked effects would start Babylon/rooms twice.
- **Run npm scripts from the repo root.** `dev:studio`, `dev:client`, etc. are root
  scripts; running them inside a workspace dir errors with "Missing script".
- **Asset import = Studio, not scripts.** Use the **Asset Library**'s one-click
  Import (Kenney, over the network) or `node scripts/stage-pack.mjs <dir> <name>`
  (local folder). The old `convert-models`/`import-models` scripts and the 505 MB
  `src/models` library they built are **deleted** — don't look for them.
- **Where models live:** **committed** under each app's `public/models` (served at
  `/models/**`). The Studio's 3D Models board + Asset Preview read
  `apps/studio/public/models` via `index.json` → per-pack `manifest.json` (no
  `import.meta.glob`). The scene loads from the app it runs in
  (`apps/game-client/public/models`), so **keep the two `public/models` in sync**
  when scene-runtime models change.
- **Kenney GLBs are vertex-colored (no texture images)** — they render correctly
  flat-shaded; don't expect PBR atlases. Import copies only referenced textures, so
  Kenney's preview PNGs are (correctly) skipped.
- **`assetValueToUrl(value)` is the canonical helper** in `asset-normalization.ts` —
  converts `"model:pack/name"` → `"/models/pack/name.glb"`. Do not re-implement inline.
- **`usePersistedJson<T>` is the canonical Studio autosave persistence hook** —
  `apps/studio/src/use-persisted-json.ts`. GET on mount, POST on update,
  returns `{value, setValue, saved, loaded}`. Supports functional updater
  (`setValue(prev => ...)`) via `valueRef.current`. Use it for autosaving
  JSON-backed surfaces. `UiBuilder` intentionally does a local draft + explicit
  Save/Revert flow so a bad chrome experiment does not immediately overwrite
  `ui-theme.json`.
- **Studio JSON endpoints all share one factory** — `jsonFilePlugin(name,
  route, file)` in `vite.config.ts`. Add a new endpoint with one line +
  matching file constant.
- **Ports:** server **2567**, game client **5173**, Studio **5174**.
