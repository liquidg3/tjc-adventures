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
| **Vertical-scroller scene** | 🚧 In progress — a vertically-scrolling ship you fly locally (no server). Tuned through the **Studio** (:5174). The current focus: iterate on art, motion, feel. |

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
| `npm run dev:studio` | Studio — asset coverage board (Vite, :5174). |
| `npm run convert-models` | Convert models from ~/Downloads → GLB for the Studio. |
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
  studio/        Studio (:5174) — the tuner: 3D-models board + scene tuning panels  ← primary work surface
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
scripts/         free-ports, clean, doctor, verify-spine, convert/import-models
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
  `resetShip`, `getLightingState`). Tunable constants are at the top of the file.
- **Debug logging:** `packages/scenes/src/debug.ts` exposes `dbg()` — on in dev and
  with `?debug`, off in production. Look for `[TJC]` lines in the console.

## Studio — the tuner (`apps/studio`, :5174)

Opens to a **launcher** of section cards: **3D Models** (ready), **Vertical
Scroller** (ready), Side Scroller / Death Race (coming soon).

```bash
npm run dev:studio   # → http://localhost:5174  (run from the repo root)
```

**Vertical Scroller** — the live scene plus collapsible tuning panels (all collapsed
by default): Ship Size, Ship Position (live x/y/z readout + reset), Camera Rotation,
Ship Altitude, Ground, Lighting (presets + sun sliders), Pixelate. Each panel drives
a `SceneHandle` method.

**3D Models** — assign a real model to every asset slot the game needs (ships,
animals, environment, terrain, props) and see which are still **missing**:

- Each slot has a **dropdown** + a **live orbit preview** (drag to rotate, scroll to
  zoom; **pixelate**/**spin** toggles). Previews lazy-mount a Babylon engine only
  while on screen and under a global context cap (see gotchas) — so the board can't
  exhaust WebGL contexts.
- **Assignments persist to `apps/studio/asset-map.json`** (committed, durable, the
  game will read it) via the dev server's `/__asset-map` endpoint; localStorage is a
  fast fallback.
- Built-in placeholder ships are always selectable; **downloaded models in
  `src/models/` appear in every dropdown** automatically as they're added.
- **Add a model:** drop a `.glb`/`.gltf` into `apps/studio/src/models/`.
- **Convert other formats:** `npm run convert-models` scans `~/Downloads`,
  converts to `.glb` (via `assimp`), and drops them in `src/models/`:

  | Format | Handling |
  |---|---|
  | `.glb` | used as-is |
  | `.gltf` `.fbx` `.obj` `.stl` `.dae` `.ply` `.3ds` | converted via `assimp` (`brew install assimp`) |
  | `.blend` `.max` `.usdz` | need their source app (e.g. Blender) — export to glb/fbx/obj first |

- Approved assets get promoted into `packages/assets` for the game to consume.

**Where to get models** (GLB drops straight into the viewer):
- **Kenney.nl** — free CC0 game assets (incl. space/ships); great fit for our look.
- **Quaternius** — free CC0 low-poly model packs.
- **Poly Pizza** — free low-poly models (the ex–Google Poly library).
- **Sketchfab** — huge library, many free/CC; export as glTF/GLB.
- **Synty (POLYGON)** — paid, cohesive low-poly art style.

## Troubleshooting & gotchas (don't repeat these)

- **WebGL context cap (~16 per page).** Every Babylon `Engine` holds one WebGL
  context; past the cap the browser drops the oldest, which corrupts *every* engine
  on the page ("Unable to create texture / vertex buffer / uniform buffer", blank
  screen). The 3D Models board hit this (one engine per card), so previews now
  lazy-mount only when on screen and lease from a hard cap of 12
  (`apps/studio/src/viewer-budget.ts`). **Never create unbounded engines.**
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
