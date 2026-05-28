# TJC: Family Adventures — Technical Architecture

> How we build the game. Serves the design in `brief.md` and the
> `prototype-meadow-run.md` vertical slice. Locked decisions below; deferred
> items are called out explicitly.

---

## 1. Guiding Principles

1. **The browser is the cross-platform runtime.** One codebase runs on the
   laptop and every phone — no native builds, no app store, no per-device ports.
   Open a URL → you're in. (Directly serves *"profiles travel to any device."*)
2. **Heavy rendering on the host only.** The laptop renders the rich shared
   screen; phones are lightweight HTML control stations. We can go visually lush
   without caring about phone GPUs.
3. **Twitchy inputs are local; tolerant inputs are remote.** Pilot (keyboard) and
   Gunner (mouse) live on the laptop; only the latency-tolerant Spotter is on a
   phone. The hardest real-time problem mostly evaporates.
4. **Game logic is decoupled from the renderer.** The simulation is pure
   TypeScript that knows nothing about Babylon — so it's testable, and the
   role/world abstraction (`brief.md` §3) is real in code, not just art.
5. **Same-room first, internet later.** LAN co-op now; the transport layer is
   isolated so a cloud relay can be added without rewriting game logic.

---

## 2. The Stack (locked)

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** | Type-safe shared code across server/clients; plays to our strengths |
| Shared-screen rendering | **Babylon.js** | Full TS-native 3D engine → lets us render 2D-as-3D for **HD-2D depth** (§6), with scene/camera/lighting/post-processing/sprites/input/assets in one package |
| Multiplayer / rooms | **Colyseus** | TS multiplayer framework: room codes, **authoritative state**, delta-synced schema, join/leave — exactly our model |
| Phone control stations | **HTML / CSS / TS** (light canvas where needed) | Buttons (`COOL IT DOWN!`, `SAVE`) and a pan-window are trivial web UI; no 3D on phones |
| Transport | **WebSocket** (Colyseus default) | Reliable, simple, fine for LAN |
| Persistence | **SQLite on the host** (via a small data layer) | Profiles, PRs, menagerie survive between sessions |
| Monorepo | **Lerna** workspace (`apps/*` + `packages/*`) | Hosts the game, server, **marketing site**, and shared **core / ui / assets** packages — reuse across the game, marketing, and future **sequels/worlds**. (Lerna delegates linking to package-manager workspaces; add Turborepo/Nx later only if task caching is worth it.) |
| Build/dev | **Vite** (clients) + **tsx** (server) | Fast HMR; code-splitting keeps the `/join` controller route light |

*Set aside:* **Phaser 3** (fastest pure-2D path, but gives up the HD-2D depth) and
**Three.js** (great renderer, but more game-framework assembly than Babylon).
Revisit only if Babylon's complexity stalls the core-loop proof.

---

## 3. Topology

```
            ┌─────────────────────── LAPTOP (the host) ───────────────────────┐
            │                                                                  │
            │   ┌────────────────────┐         ┌─────────────────────────┐     │
   keyboard │   │  Colyseus SERVER   │◄───────►│  DISPLAY client (browser)│    │ ← the shared
   + mouse ─┼──►│  (Node)            │ localhost│  Babylon.js HD-2D scene  │────┼─► "table" screen
   (Pilot,  │   │  • authoritative   │  (instant)│  renders synced state   │    │
   Gunner)  │   │    simulation      │         └─────────────────────────┘     │
            │   │  • rooms + sync    │                                          │
            │   │  • SQLite profiles │   shows room code + QR on the table      │
            │   └─────────┬──────────┘                                          │
            └─────────────┼─────────────────────────────────────────────────────┘
                          │ WebSocket over LAN (WiFi)
              ┌───────────┴────────────┐
              ▼                         ▼
      ┌───────────────┐         ┌───────────────┐
      │ PHONE (Spotter)│        │ PHONE (Spotter/│   ← controller clients:
      │ HTML station:  │        │ extra player)  │     pan-window + tag + assist
      │ pan/tag/cool/  │        │                │     buttons. Send intents,
      │ patch/SAVE     │        │                │     render light UI only.
      └───────────────┘         └───────────────┘
```

- The **laptop runs both** the Colyseus server (authoritative sim) and the
  Babylon display client. The display talks to the server over **localhost** →
  effectively zero latency for Pilot/Gunner inputs.
- **Phones** join over the LAN and exchange small messages (intents up, light
  state down). We **never stream the game video** to phones.

---

## 4. Authority & Netcode Model

- **The Colyseus server is authoritative.** It runs a **fixed-tick simulation
  (30 Hz)** of the shared `GameState`, applies validated **input intents** from
  all clients, and broadcasts delta-compressed state.
- **Clients render, they don't decide.** The Babylon display renders at 60 fps,
  **interpolating** between server snapshots. Phones render their station UI from
  the same synced state.
- **Inputs are intents, not state mutations.** e.g. `{type:"move", dx, dy}`,
  `{type:"fire"}`, `{type:"tag", entityId}`, `{type:"rapidTap", channel:"cool"}`,
  `{type:"rally", targetPlayerId}`. The server is the only thing that changes the
  world.
- **Latency:** localhost (laptop) is instant, so no prediction needed for
  Pilot/Gunner in v1. Phone↔laptop on home WiFi is ~10–30 ms — fine for
  tag/cool/patch/rally (all tolerant). Client-side prediction stays an *option*,
  not a v1 requirement.
- **Tap-rate mechanics** (cool/patch/rally) send rate-limited tap pulses; the
  server accumulates the revive/cooldown meter so the authority stays consistent.

---

## 5. Game Logic Architecture (renderer-agnostic core)

Pure TypeScript in `packages/core`, run by the server, importable by clients
for types/helpers. Built as a lightweight **ECS / system pipeline**:

- **Entities:** ship, enemies (drone/turret/rammer), projectiles, cages, animals,
  powerups, the Warden, FX markers.
- **Components:** `Transform`, `Velocity`, `Health`, `Heat`, `Collider`,
  `Taggable`, `Rescuable(value, behavior)`, `Downable`, etc.
- **Systems (tick order):** input-intent → movement → firing/heat → spawning →
  collision → rescue/tractor → assist (cool/patch) → down/rally → scoring →
  cleanup.

### Roles & Worlds (the abstraction that makes `brief.md` §3 real)

- A **Role** = a typed bundle of (allowed intents) + (capabilities it unlocks) +
  (its control-station descriptor). `Pilot`, `Gunner`, `Spotter` are data +
  small handler modules. A player is assigned a Role + Tier; the server only
  accepts intents that Role permits.
- A **World** = a content pack (entity definitions, spawn tables, art/asset refs,
  physics flavor) that **reuses the same systems**. `SkyRaid` is World #1.
  Adding *Tank Squad* later means a new content pack, **not** new role code.
- **Assist hooks** (overheat→cool, hull→patch, **rally-to-revive**) are generic
  systems gated on the managing role being present — implementing the §9
  *"disable mechanics with no human to manage them"* rule directly.

---

## 6. Rendering: HD-2D Pipeline (Babylon)

2D gameplay, rendered in a 3D scene for depth (the Octopath-style "HD-2D" look).

- **Art direction (locked): Kenney CC0 low-poly 3D kits** are the source for all
  game models — vertex-colored, self-contained, license-clean to commit. They're
  browsed and one-click-imported via the Studio's Asset Library into committed
  `public/models` (see `docs/STATE.md` → "Assets & art direction"). The pixel/
  posterize post-process below sits *on top of* these flat-shaded models.
- **Orthographic camera**, top-down, for the vertical scroller (slight tilt
  optional for into-screen depth).
- **Layered Z-depth:** parallax background(s) → ground plane → gameplay sprites →
  foreground → FX → UI overlay. Real parallax + sorting from actual Z.
- **Sprites** via Babylon `SpriteManager` / textured planes; **hero objects**
  (ship, Warden) as low-poly **3D models with a pixel/posterize shader** so they
  bank, roll, and animate while still reading as 8-bit. Facing is a runtime
  concern, not a model-data one — the player ship gets a fixed 180° yaw applied
  to its visual root so Kenney's glTF-forward (−Z) becomes gameplay-forward
  (+Z). Enemies will use a separate facing constant so they look at the player.
  See `STATE.md` → Gotchas for the convention.
- **Crisp-pixel pipeline:** render the scene to a **low-res target (~384×216)**
  with nearest-neighbor + limited-palette post-process, then **integer-upscale**
  to fullscreen. Authentic chunky pixels *over* real 3D lighting.
- **Dynamic lights:** thruster glow, explosions, the **tractor-beam cone** cast
  light on nearby sprites/terrain.
- **Post-processing:** bloom, subtle CRT/scanline, screen-shake, hit flashes —
  the "juice." A camera push-in + tilt punctuates the Warden's entrance.

> Discipline: the **first milestone uses grey-box visuals**. HD-2D depth is
> layered in *after* the core loop and netcode are proven (§9 build order).

### Phone station rendering
Phones render a **lightweight 2D view** (DOM markers or a small Canvas2D radar)
of only the **taggable/relevant entities** in the Spotter's pan-window — never
the full scene. Big touch targets, assist buttons appear contextually.

---

## 7. Profiles & Persistence ("travel")

- **Profile** = id, name, avatar, role+tier, **favorite animals**, **menagerie**,
  per-tier **PRs**, family/world PRs, unlocks. (Matches `brief.md` §12–13.)
- **Source of truth = the host.** Profiles persist in **SQLite on the laptop**, so
  PRs/menagerie survive across sessions.
- **"Travel" within the same-room model:** any device that joins **claims a
  profile** from the host's list; the host holds the canonical record, so your
  identity/tier follows whatever device you grab — which is exactly the §11
  promise for couch co-op.
- **Cross-network travel** (different houses/networks) = a cloud profile service,
  **deferred** with internet play.

---

## 8. Connection / Join Flow

1. Laptop opens the **host** view → creates a Colyseus room → server detects its
   **LAN IP** (`os.networkInterfaces`) and the room code.
2. The table screen shows a **QR code** encoding
   `http://<lan-ip>:<port>/join?room=<CODE>`.
3. Phone scans it (native camera app) → loads the **controller** client → joins
   the room → **picks a profile** → is assigned/claims a **role** → its control
   station renders.
4. **Lobby/seat-claim + role rotation** (`brief.md` §11) run as room state before
   the run starts.

---

## 9. Project Structure & Build Milestones

### Monorepo — Lerna workspace (`apps/*` + `packages/*`)
```
apps/
  game-client/   # Vite app, code-split by route:
                 #   /      → host/display mode (Babylon HD-2D)  ← laptop
                 #   /join  → controller mode (HTML stations)    ← phones
  game-server/   # Colyseus server: runs the core sim, rooms, SQLite persistence
  marketing/     # marketing site (landing, trailer, asset showcase);
                 #   Astro + React islands, consumes ui + assets

packages/
  scenes/        # Babylon scene factories (@tjc/scenes) — the live vertical-scroller
                 #   scene, shared by the game client AND the Studio tuner
  core/          # pure-TS game engine: ECS, systems, roles, worlds, types (no engine deps)
                 #   → reused by the game AND any future sequel/world
  ui/            # shared React components: branding, buttons, animal cards,
                 #   menagerie — used by game menus/controllers AND marketing
  assets/        # sprites, spritesheets, palettes, audio manifests, animal art
                 #   → single source consumed by the game and shown on marketing
  config/        # shared tsconfig / eslint / prettier presets

# lerna.json + root package.json workspaces. Lerna delegates linking to the
# package manager; add Turborepo/Nx later for task caching if needed.
```

### Milestones (mapped to the prototype build order)
- **M0 — Plumbing.** Monorepo + Colyseus room + host client + one phone joins via
  QR. *Proves the cross-device spine.*
- **M1 — Pilot loop.** Ship + vertical scroll + keyboard intents → server sim →
  Babylon grey-box render.
- **M2 — Gunner loop.** Mouse aim/fire + drones + **Heat/overheat**.
- **M3 — Spotter + the hero beat.** Phone station: pan + tap-tag + **rapid-tap
  COOL IT DOWN!** → validates **prototype Proof #3** (the riskiest claim).
- **M4 — Rescue.** Cages + green-tag + tractor + menagerie (animal values).
- **M5 — Patch.** Hull + breaches + **PATCH!**.
- **M6 — Down & Rally.** CRITICAL-hull down state + **SAVE [name]!** + graceful
  fail.
- **M7 — The Warden.** All-roles boss with down→rally under fire.
- **M8 — Extract + Results.** Timed escape + PR/Family-PR + fun facts.
- **M9 — HD-2D polish.** Layer in depth, lighting, post-processing, juice.

M0–M3 alone prove the core hypothesis before we invest in everything after.

---

## 10. Technical Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **Secure-context APIs over LAN http** (Wake Lock, PWA install, in-page camera) are blocked on `http://<lan-ip>` | Scan QR with the phone's **native camera** (no in-page camera needed); use **mkcert/local CA for HTTPS** in dev if Wake Lock/PWA matter; cloud relay later gives real HTTPS. Core gameplay + WebSockets work fine over LAN http. |
| **WiFi AP isolation / guest networks** block device-to-device | Document "use your home network"; provide a **cloud-hosted Colyseus relay** as the fallback (also the path to internet play) |
| **iOS Safari** audio needs a gesture; fullscreen is limited | First-tap "Start" to unlock audio; PWA home-screen for app-like fullscreen |
| **Phone screen sleep** mid-game | Wake Lock (needs HTTPS) or a no-sleep fallback; keep sessions active |
| **Pixel-perfect crispness** with 3D | Fixed low-res render target + integer upscale + nearest filtering |
| **Babylon complexity stalls the loop** | M0–M3 grey-box discipline; Phaser remains the documented fallback |

---

## 11. Deferred (post-v1)

- **Internet / remote play** — cloud-hosted Colyseus relay + HTTPS + cloud profiles.
- **Shared Power budget** netcode (`brief.md` §7).
- **More Worlds** as content packs (Tank Squad, Death Race, Side-Scroller).
- **Client-side prediction / rollback** — only if a future config needs it.
- **2-player edge configs** (no-Pilot / no-Gunner) beyond the disable-when-absent rule.
