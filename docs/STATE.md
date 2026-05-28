# STATE — pick up here (handoff)

> **Read this first.** It is the precise current state of the project so you can
> continue *exactly* where the last session stopped — no code archaeology, no
> relearnings. Design canon is in `docs/` (`brief.md`, `prototype-meadow-run.md`,
> `architecture.md`); how-to + gotchas in `README.md`; agent rules in `AGENTS.md`.
> **All knowledge lives in the repo — do not use private/agent memory.**

_Last updated: 2026-05-28._

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
- **NEXT: gameplay layer (enemies first).** `ship-enemy = craft_miner` is
  already in `asset-map.json` but never spawns. The dodge is now built to dodge
  *something* — that something is the natural next step. See "Suggested next
  steps" below.

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
  src/Home.tsx             launcher cards → models | assets | asset-test | vertical (+ side/race soon)
  src/App.tsx              section router (Home ↔ a section)
  src/AssetLibrary.tsx     ★ Kenney pack browser: live thumbnails + one-click Import (Assets section below)
  src/AssetTest.tsx        single shared 3D viewer — simple rotating isometric browse view; auto-applies kit preset
  src/ModelsBoard.tsx      3D Models board: assign a staged model + normalization preset to each game slot → asset-map.json
  src/SlotCard.tsx         one slot: dropdown + preset select + expanded modal draft/save normalization workflow
  src/ModelPreview.tsx     budgeted orbit preview (grid card = beauty view, expanded modal = 2x2 alignment grid)
  src/asset-normalization.ts preset registry + asset-map parsing/serialization helpers + model overrides
  src/viewer-scene.ts      createViewer(): orbit-preview engine (GLB load + optional shared-atlas + setOrient)
  src/viewer-budget.ts     caps live WebGL contexts at 6 — leased by ModelPreview (Asset Test uses ONE shared viewer)
  src/models.ts            loadStagedModels(): reads imported packs from public/models (index.json + manifests)
  src/slots.ts             the game asset slots (Ships/Animals/Environment/…)
  src/VerticalScroller.tsx the scene + tuning panels (zone / camera / ship / ground / lighting / scenery / pixel);
                           now reads asset-map + normalization presets so the live ship matches the 3D Models board
  src/vertical-scroller-state.ts reducer + persisted defaults + deep-link hash; the zone list lives here
  public/models/           ★ PRODUCTION assets (committed): kenney-<pack>/*.glb + manifest.json, index.json;
                             plus legacy ships/ + environment/ the scene still loads (pending the swap)
  vite.config.ts           dev endpoints: /__asset-map, /__vertical-defaults, /__asset-normalization-{presets,overrides}, /__kenney/{list,meta,import}
  asset-map.json           committed slot→model assignments
  asset-normalization-presets.json   committed shared normalization baselines
  asset-normalization-overrides.json committed per-model normalization overrides

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

1. **Enemies — start the gameplay layer.** `asset-map.json` already has
   `ship-enemy = kenney-space-kit/craft_miner` but nothing spawns. First pass:
   simple straight-line enemies streaming down-screen, no shooting yet — give
   the player something to use the freshly-tuned dodge on. Per
   `prototype-meadow-run.md`. (When you spawn enemies, remember they face the
   **opposite** way to the player — they should look toward the player, so do
   NOT apply `SHIP_MODEL_FORWARD_YAW` to them; that constant is player-only.)
2. **Finish the Kenney scenery swap.** The scene still loads the last legacy
   `/models/environment/{bush,rocks_small,tree_fur,tree_stylized}.glb` props.
   Pick Kenney nature-kit replacements via the 3D Models board, repoint
   `scene-config.SCENERY_MODELS`, delete the legacy files, sync
   `apps/game-client/public/models`. (Scenery doesn't need a forward-yaw — only
   ships have a front.)
3. **Shooting** — wire projectiles from the player ship's nose (the Gunner
   role); enemies become real targets.
4. Lock the **look**: settle lighting + ground direction; decide if
   hardware-scaling pixel stays or the low-res-RT pipeline
   (`architecture.md` §6) is needed; bake into defaults.
5. Continue **gameplay** — pickups, **rescue cages**, the **Warden** boss — per
   `docs/prototype-meadow-run.md`.
6. **Reconnect multiplayer** (roles across devices) per `docs/architecture.md`.

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
