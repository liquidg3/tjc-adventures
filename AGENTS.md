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
- **WebGL context cap (~16/page).** Each Babylon `Engine` = one WebGL context;
  exceeding the cap kills the oldest and corrupts every engine on the page. Never
  create unbounded engines — see `apps/studio/src/viewer-budget.ts`.
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

## Where things live
- **Live scene (Babylon):** `packages/scenes/src/ship-scene.ts` → `@tjc/scenes`
- **Studio (tuner + asset board):** `apps/studio` (:5174) — the primary work surface
- **Game client (mounts the scene):** `apps/game-client` (:5173)
- Game logic core (shared types): `packages/core`
- Server (Colyseus, parked): `apps/game-server`
- Helper scripts: `scripts/` (free-ports, clean, doctor, verify-spine, convert/import-models)
