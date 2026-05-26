# STATE — pick up here (handoff)

> **Read this first.** It is the precise current state of the project so you can
> continue *exactly* where the last session stopped — no code archaeology, no
> relearnings. Design canon is in `docs/` (`brief.md`, `prototype-meadow-run.md`,
> `architecture.md`); how-to + gotchas in `README.md`; agent rules in `AGENTS.md`.
> **All knowledge lives in the repo — do not use private/agent memory.**

_Last updated: 2026-05-26._

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
  decoupled from netcode/gameplay. The last sessions added live tuning panels
  (lighting, pixel, ground, camera, ship) and hardened the asset board.

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

apps/studio/               ★ THE TUNER (port 5174) — primary surface
  src/Home.tsx             launcher: section cards → models | vertical | side | race
  src/App.tsx              section router (Home ↔ a section)
  src/VerticalScroller.tsx the scene + collapsible tuning panels (zone plan / camera / ship / ground / lighting / pixel)
  src/vertical-scroller-state.ts reducer + persisted defaults + deep-link hash; the zone list lives here
  src/ModelsBoard.tsx      3D Models board: a slot per game asset, grouped by category
  src/SlotCard.tsx         one slot: dropdown + live preview
  src/ModelPreview.tsx     orbit preview; lazy-mounts a Babylon engine ONLY when on screen + under budget
  src/viewer-scene.ts      createViewer(): the orbit-preview engine (loads GLB or built-in placeholder)
  src/viewer-budget.ts     ★ caps live WebGL contexts at 12 (see gotcha) — leased by ModelPreview
  src/slots.ts             the asset slots (Ships/Animals/Environment/Terrain/Props)
  src/models.ts            AUTO-DISCOVERS src/models/**/*.glb via import.meta.glob
  src/models/{ships,animals,environment,terrain,props}/  the full imported model library (~508 MB, unoptimized)
  public/models/{ships,environment}/  the LIGHT models the scene loads at runtime (/models/...)
  vite.config.ts           assetMapPlugin(): GET/POST /__asset-map ↔ asset-map.json (durable persistence)
  asset-map.json           committed slot→model assignments (source of truth; localStorage is fallback)

apps/game-client/          Vite + React (port 5173)
  src/GameSandbox.tsx      mounts @tjc/scenes on a canvas (route /)
  src/main.tsx             routes: / = sandbox, /host = Host lobby, /join = Controller (phone)
  src/Host.tsx / Controller.tsx / colyseus.ts   M0 multiplayer spine (parked)
  public/models/{ships,environment}/  the scene's runtime models for this app

apps/game-server/          Colyseus authoritative server (parked); GameRoom + GameState
apps/marketing/            stub
packages/core/             shared TS types (Role, JoinOptions, ROOM_NAME, ports)
packages/ui|assets|config/ stubs (assets = intended future home for game art)
scripts/                   free-ports, clean, doctor, verify-spine, convert-models, import-models
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
setLevelPlan, getZoneStatus  (+ setGroundTile, setPipelineMode, setRtHeight, ship-light setters)
```

**Structure after the refactor:**

- `ship-scene.ts` is now the composition root, not the implementation dump.
- `flight-controller.ts` owns ship movement, viewport clamp math, and camera bank.
- `ship-controller.ts` owns player ship load/swap/size/shadow/material state.
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
so the existing **Ground** + **Lighting** panels edit it (no duplicate controls).
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
- **Movement / bounds:** Arrows/WASD, Shift boost, `P` pixel toggle. **X and Z are
  clamped to the actual visible viewport** by projecting the ship to screen space
  and raycasting into its flight plane. **This math runs in CSS-pixel space
  (`canvas.clientWidth/Height`), NOT `getRenderWidth()`** — see the pixelation
  gotcha below.
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

- **Ship Size** (slider) · **Ship Position** (live x/y/z readout + "Reset to start")
- **Camera Rotation** (the 7 modes) · **Ship Altitude** (slider)
- **Ground** (4 styles) · **Lighting** (5 presets + Sun / Sky / Angle / Height sliders)
- **Pixelate** (Off / 2× / 3× / 4×)

Each panel maps to a `SceneHandle` method. The Ship-Position readout is how QE
reports good coordinates back; that's why `getShipPosition`/`resetShip` exist.

## The 3D Models board — `apps/studio/src/ModelsBoard.tsx`

Assign a real model to each game asset slot. **Assignments persist to the committed
`apps/studio/asset-map.json`** via the dev server's `/__asset-map` GET/POST endpoint
(`assetMapPlugin` in `vite.config.ts`); localStorage is a fast fallback. The game
will read this map later. Dropdown options = built-in placeholder ships +
auto-discovered `src/models/**/*.glb`.

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
6. **Models are HUGE & unoptimized** (`apps/studio/src/models` ≈ **508 MB**; terrain
   scans 40–100 MB, `sloth` ~63 MB). The scene only loads the light ones from
   `public/models`. **Before using the heavy/nice models in the game, run a
   `gltfpack` (meshoptimizer) pass** (simplify + texture downscale + compress).
7. **A few GLBs may have texture issues** (`ship_helicopter`, `bunny`, `sloth`
   showed "Unable to create texture"). That surfaced *during* the WebGL
   context-loss cascade (now fixed), so **re-verify after a fresh reload**; if a
   specific model still fails, reconvert it.

**Gameplay (not started — pilot-flight only):**
8. No shooting / enemies / pickups / rescue / cages yet. Roles (Gunner, Spotter) are
   designed in `docs/` and the **M0 spine exists but is parked** — neither is wired
   into the scene. **No auto-fire** (kids own the shooting).
9. **Raiden pickup mechanics** (weapon medals → upgrades, bombs) — adapt later per
   `prototype-meadow-run.md`.

## Suggested next steps (in order)

1. Lock the **look**: settle lighting + ground direction; decide if hardware-scaling
   pixel stays or the low-res-RT pipeline is needed.
2. Bake the chosen lighting/ground into defaults; trim now-unneeded tuner panels.
3. **Optimize** the heavy models (`gltfpack`) and curate final env/ship models via
   the 3D Models board.
4. Build the **gameplay layer** (Raiden-inspired): enemies, wire the **Gunner's**
   shooting, pickups, **rescue cages**, the **Warden** boss — per
   `docs/prototype-meadow-run.md`.
5. **Reconnect multiplayer** (roles across devices) per `docs/architecture.md`.

---

## Gotchas (already hit — don't relearn)

- **WebGL context cap (~16/page).** Each Babylon `Engine` = one WebGL context. The
  3D Models board renders one engine per card, so a full board exceeded the cap, the
  browser dropped the oldest contexts, and **every** engine on the page died
  ("Unable to create texture / vertex buffer / uniform buffer", blank screen).
  Fixed by `apps/studio/src/viewer-budget.ts` (hard cap of **12** leased slots) +
  `ModelPreview.tsx` lazy-mounting an engine only while the card is on screen
  (IntersectionObserver). **Never create unbounded Babylon engines on one page.**
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
- **No `React.StrictMode`** — double-invoked effects would start Babylon/rooms twice.
- **Run npm scripts from the repo root.** `dev:studio`, `dev:client`, etc. are root
  scripts; running them inside a workspace dir errors with "Missing script".
- **Model conversion:** `npm run convert-models` (assimp: fbx/obj/stl→glb from
  `~/Downloads`) and `node scripts/import-models.mjs` (the one-time categorized
  import that produced `apps/studio/src/models`, bundling Sketchfab `scene.gltf`
  packages into single GLBs via gltf-pipeline).
- **Where models live:** the scene loads `/models/**` served from each app's
  `public/models` (`apps/studio/public/models`, `apps/game-client/public/models`);
  the 3D Models board previews auto-discover `apps/studio/src/models/**` via
  `import.meta.glob`.
- **Ports:** server **2567**, game client **5173**, Studio **5174**.
</content>
