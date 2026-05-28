# TJC: Family Adventures

A family co-op game — *one vessel, many hands.* A parent and kids of different
ages all play the same run at once, each with a role matched to their ability,
and the vessel only succeeds when they work together.

- 🧠 **New here? Agents read [AGENTS.md](./AGENTS.md) first.**
- 📖 **Design & plans:** [`docs/`](./docs/README.md) — the *what* and *why*.
- 🛠 **This README:** the *how* — running, scripts, gotchas, status.

---

## Status

| Track | State |
|---|---|
| **M0 — cross-device spine** | ✅ Done & verified (host QR → phone joins a Colyseus room, input round-trips). **Parked** at `/host` + `/join` while we focus on graphics. |
| **Vertical-scroller scene** | 🚧 In progress — a vertically-scrolling ship you fly locally (no server). Tuned through the **Studio** (:5174). Player ship is dialed (Kenney `craft_racer`, banks, dodge jumps). Next: wire the **Level Builder** grid into the scene, then enemies. **Art direction = Kenney CC0 low-poly** for game art (imported via Asset Library) + **Kenney UI Pack Sci-Fi** for Studio chrome. |

---

## Prerequisites

- **Node ≥ 20** (developed on 25; see [`.nvmrc`](./.nvmrc)). `nvm use` if you use nvm.
- npm (workspaces). No other global installs needed.

## Quick start

```bash
npm install          # install all workspaces
npm run doctor       # pre-flight: Node version, deps, ports free
npm run dev:client   # graphics sandbox → open http://localhost:5173 and fly
```

For the full two-screen setup (parked multiplayer spine):

```bash
npm run dev          # boots server (:2567) + client (:5173) together
# laptop: http://localhost:5173/host   → shows a room code + QR
# phone:  scan the QR on the same WiFi → joins as a controller
```

## Scripts (run from repo root)

| Script | Does |
|---|---|
| `npm run dev` | Frees ports, then boots **server + client** together (prefixed output, clean shutdown). |
| `npm run dev:client` | Just the client (Vite, :5173). Enough for the graphics sandbox. |
| `npm run dev:server` | Just the Colyseus server (:2567). |
| `npm run dev:studio` | Studio — tuner + Kenney asset tools (Vite, :5174). |
| `npm run stage-pack` | Stage a local GLB/OBJ/FBX pack folder into `public/models` (manual alternative to the Asset Library's one-click Import). |
| `npm run build` | **Typechecks every workspace**, then builds. Won't build with type errors. |
| `npm run typecheck` | Typecheck all workspaces. |
| `npm run doctor` | Pre-flight health check (Node, deps, ports). |
| `npm run free-ports` | Kill anything stuck on :2567 / :5173. |
| `npm run clean` | Remove build artifacts. `npm run reset` also wipes node_modules + reinstalls. |
| `npm run verify:spine` | Headless end-to-end check of the multiplayer room spine. |

> `predev` runs `free-ports` automatically, so `npm run dev` never fails with a
> port-in-use error from a previous run.

## Monorepo layout (Lerna + npm workspaces)

```
apps/
  game-client/   Vite + React. Routes:
                   /      mounts the @tjc/scenes vertical-scroller (no panels)
                   /host  laptop "table" lobby (M0 spine, parked)
                   /join  phone controller (M0 spine, parked)
  game-server/   Colyseus authoritative server (:2567)
  studio/        Studio (:5174) — tuner + Kenney asset tools (Library/Test/Models board)  ← primary work surface
  marketing/     marketing site (stub)
packages/
  scenes/        ★ the live Babylon scene (@tjc/scenes)
                   ship-scene.ts = composition root
                   scene-config.ts / *-controller.ts / ground-texture.ts / ship-materials.ts
                   hold the shared runtime modules
  core/          pure-TS shared types/constants (Role, JoinOptions, ports)  ← game + sequels
  ui/            shared React components (stub)                              ← game + marketing
  assets/        sprites, palettes, audio (stub)                            ← game + marketing
  config/        shared presets (stub)
scripts/         free-ports, clean, doctor, verify-spine, stage-pack
```

## The vertical-scroller scene

- Code: **`packages/scenes/src/ship-scene.ts`** (the Babylon scene composition
  root, shared as `@tjc/scenes`). It now composes:
  `scene-config.ts`, `flight-controller.ts`, `ship-controller.ts`,
  `lighting-controller.ts`, `prop-field.ts`, `ground-texture.ts`, and
  `ship-materials.ts`. Mounted by `apps/game-client/src/GameSandbox.tsx` (route `/`,
  no panels) and by `apps/studio/src/VerticalScroller.tsx` (the tuner, with panels).
  **Tune it in the Studio** (`npm run dev:studio`).
- **Controls:** Arrows / WASD to fly, `Shift` to boost, `P` to toggle pixel mode.
  The ship reaches the full visible viewport in both axes; the field scrolls with
  3D scenery depth.
- **Visual state:** real GLB models from `public/models/**` + a procedural meadow
  ground (4 styles). A **real blurred, projected `ShadowGenerator` shadow** (the
  old blob disc is gone). Lighting via 5 presets plus **live sun position +
  intensity** controls. Bank default is **`Camera Z`** (subtle).
- **Runtime contract:** `createShipScene(canvas)` returns a `SceneHandle` with
  setters for camera mode, ship height/size, ground style, pixel scale, lighting
  preset, and sun intensity/sky/azimuth/elevation (plus `getShipPosition`,
  `resetShip`, `getLightingState`). The Studio vertical scroller now also reads
  the selected `ship-player` assignment plus its saved normalization preset, so
  the live ship matches the 3D Models board. Tunable constants are at the top
  of the file.
- **Debug logging:** `packages/scenes/src/debug.ts` exposes `dbg()` — on in dev and
  with `?debug`, off in production. Look for `[TJC]` lines in the console.

## Studio — the tuner + asset tools (`apps/studio`, :5174)

Opens to a **launcher** of section cards: **3D Models**, **Asset Library**, **Asset
Test**, **Vertical Scroller** (Side Scroller / Death Race coming soon).

```bash
npm run dev:studio   # → http://localhost:5174  (run from the repo root)
```

**Art direction = Kenney CC0 low-poly.** All game art comes from Kenney's CC0 3D
kits. They're browsed, imported, previewed, and assigned entirely in the Studio; the
results commit to `apps/studio/public/models`.

**Asset Library** — a live browser of every Kenney 3D pack (scraped from kenney.nl by
the dev server). Hit **Import** on a pack and the server downloads + unzips + stages
its GLBs straight into committed `public/models/kenney-<slug>/` (one click). Cards
show "✓ imported" for packs already staged. *Manual alternative:* `node
scripts/stage-pack.mjs <localDir> <name>` for a pack folder on disk.

**Asset Test** — preview any staged model in **one shared 3D viewer** (a single WebGL
context, so it scales to any pack size) as a simple rotating isometric browse view.
All kits start collapsed. The viewer auto-applies the matching normalization preset
based on the selected pack.

**3D Models** — assign a real model to every asset slot the game needs (ships,
environment, …), and choose a **normalization preset** for that assignment:

- Each slot has a **dropdown** + a **live orbit preview** (drag to rotate, scroll to
  zoom; **pixelate**/**spin** toggles). Previews lazy-mount a Babylon engine only
  while on screen and under a global context cap (see gotchas) — so the board can't
  exhaust WebGL contexts.
- **Dropdown options** are loaded from the staged Kenney packs in `public/models`
  (`loadStagedModels()` reads `index.json` → per-pack `manifest.json`). Import packs
  in the **Asset Library** first; they appear here automatically.
- Each assigned slot also has a **normalization preset** (`none`,
  `kenney-space-kit`, `kenney-nature-kit`). The grid card stays presentational:
  a slow rotating isometric orbit preview with mouse interaction.
- The **expanded modal** is the real normalization tool:
  a 2×2 alignment grid (`Top`, `Front`, `Side`, `Iso`) plus the tuning controls in
  the side panel.
- Normalization editing is now **draft-based**, not live-persisted. The modal has:
  `Reset Draft`, `Save Preset`, `Save For Model`, and `Clear Model Override`.
- Shared preset baselines persist to `apps/studio/asset-normalization-presets.json`.
- Model-specific overrides persist to `apps/studio/asset-normalization-overrides.json`.
- **Assignments persist to `apps/studio/asset-map.json`** (committed, durable, the
  game will read it) via the dev server's `/__asset-map` endpoint; localStorage is a
  fast fallback. The file now supports both the old string form and the new object
  form with `{ model, preset }`.

Current known issue:
- The **vertical scroller ship can still fly backward even when the preview alignment
  looks correct**. The runtime ship normalization wiring exists and the scene reads
  presets + overrides, but the final runtime forward convention still disagrees with
  the preview reference somewhere. That is the next bug to solve.

**Vertical Scroller** — the live scene plus collapsible tuning panels (all collapsed
by default): Zone Plan, Ship Size, Ship Position (live x/y/z readout + reset), Camera
Rotation, Ship Altitude, Ground, Lighting (presets + sun sliders), Ship Lighting,
Scenery, Pixelate. Each panel drives a `SceneHandle` method.

## Troubleshooting & gotchas (don't repeat these)

- **WebGL context cap (~16 per page).** Every Babylon `Engine` holds one WebGL
  context; past the cap the browser drops the oldest, which corrupts *every* engine
  on the page ("Unable to create texture / vertex buffer / uniform buffer", blank
  screen). The 3D Models board hit this (one engine per card), so previews now
  lazy-mount only when on screen and lease from a hard cap of 6
  (`apps/studio/src/viewer-budget.ts`); the Asset Test screen uses a single shared
  viewer instead. **Never create unbounded engines.**
- **Ship forward-yaw convention (player only).** Kenney space-kit ships are
  modeled nose-toward −Z; gameplay-forward is +Z. The runtime applies
  `SHIP_MODEL_FORWARD_YAW = π` to the *visual model root* (inside the pivot, so
  bank/roll axes stay world-Z) — see `packages/scenes/src/ship-controller.ts`.
  Don't reuse for enemies; they want the opposite facing.
- **Bank/dodge roll signs match** (both negative on input). The 180° model yaw
  swaps left/right relative to world, so both bank (`-latFrac`) and dodge
  (`-dodgeDir`) use a negative coefficient — see `flight-controller.ts`. New
  roll behaviours must follow the same sign.
- **`ArcRotateCamera` vertical singularity.** Don't `setPosition` it perfectly
  overhead — drive top-down views via `alpha`/`beta` with `beta ≈ 0.01`
  (`viewer-scene.ts:applyCameraView`).
- **Kenney's UI tag is `tag:interface`** (`tag:UI` returns nothing). The
  Asset Library scraper hits both `category:3D` and `tag:interface` and merges.
- **Studio JSON endpoints share one factory.** `jsonFilePlugin(name, route,
  file)` in `vite.config.ts`. Frontend reads/writes via
  `usePersistedJson<T>(url, initial, parse)` from `use-persisted-json.ts`.
  Roll a new persisted Studio surface = 1 factory call + 1 hook call.
- **Kenney UI sci-fi 9-slice values matter.** The `button_square_header_*`
  card images (192×64) have a fixed ~22–28px blue header band on top + ~6–8px
  screw row on bottom; use `border-image-slice: 26 12 12 12 fill` so the band
  stays sharp. `Double` variants (384×128) need 2× slice (52/24/24/24). For
  pill bars (`bar_round_small/large`, 96×16/24), slice 8 or 12.
- **Dodge bypasses momentum easing.** A one-shot velocity burst gets bled off
  in ~0.1s by the normal `velX += (target - velX) * accel`. The dodge instead
  *locks* velX to `dodgeDir * SHIP_SPEED * DODGE_DASH` for the whole
  `DODGE_DURATION` — see `flight-controller.ts`.
- **Pixelation breaks screen-space math if you use render-buffer dims.**
  `engine.setHardwareScalingLevel(n)` shrinks the render buffer to 1/n, and Babylon's
  `createPickingRay` *also* divides input coords by that level — so using
  `getRenderWidth()` for the ship's nav clamp shrank the playable box by `n`. Do
  picking/clamp math in **CSS-pixel space** (`canvas.clientWidth/Height`).
- **`colyseus` must be default-imported, not named.** It ships CommonJS; Node's
  ESM loader can't see its named exports. Use
  `import colyseus from "colyseus"` then `colyseus.Server` / `colyseus.Room`
  (see `apps/game-server/src`). Same for `@colyseus/ws-transport`.
- **Run npm scripts from the repo root** — `dev:studio` / `dev:client` / `dev` are
  root scripts; running them inside a workspace dir errors with "Missing script".
- **Port already in use?** `npm run free-ports`. `npm run dev` does this for you.
- **Phone can't reach the host?** You must be on the **same WiFi**, and some
  networks use *AP/client isolation* (common on guest networks) that blocks
  device-to-device — use a normal home network. Scan the QR with the phone's
  **native camera** (in-page camera needs HTTPS, which LAN http isn't).
- **Babylon bundle is ~5 MB** (full-engine convenience import). Fine for dev;
  before shipping, switch to Babylon subpath imports / `manualChunks` to slim it.
- **No `React.StrictMode`** — its double-invoked effects would start the Babylon
  engine (and rooms) twice. Revisit once setup is idempotent.
- **Babylon 2D planes need `backFaceCulling = false`.** `MeshBuilder.CreatePlane`
  faces one way; with the camera on the other side every triangle is culled and
  the mesh renders nothing (it still counts as an "active mesh" — blank screen
  with no error). Also: textures must be lit (`HemisphericLight`) *or* set via
  `emissiveTexture` — `diffuseTexture` + `disableLighting` shows nothing.
- **Don't drive `engine.resize()` from a `ResizeObserver` on the canvas** — it
  feeds back on itself (size oscillates). Use the window `resize` event.

---

## Working agreements

- **All project knowledge lives in the repo** (this README, `AGENTS.md`,
  `docs/`) — *not* in any agent's private memory. So anyone can pick it up.
- **Design before technology.** Settle the *what/why* in `docs/` before tooling.
- **`docs/brief.md` is a clean declarative spec** — no Q&A logs or decision
  history; fold decisions into the relevant section.
