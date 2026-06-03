# TJC: Family Adventures — Docs

A family co-op game where a parent and kids of different ages all play the same
run at once, each with a role matched to their ability — and the vessel only
succeeds when they work together. *One vessel, many hands.*

| Doc | What it covers |
|---|---|
| [STATE.md](./STATE.md) | ⭐ **Current state & where to pick up** — repo map, live scene tunables, open punch list, next steps. Read first when continuing work. |
| [brief.md](./brief.md) | **The design source of truth** — north star, roles, complexity tiers, shared vessel, cross-member assists (incl. Rally-to-Revive), crew scaling, mission loop, rescue tone & animals, profiles/screens, scoring, worlds, and future depth. |
| [prototype-meadow-run.md](./prototype-meadow-run.md) | **The vertical-slice prototype** — Sky Raid "Meadow Run": phase-by-phase walkthrough, exact per-role/per-tier controls, tunable numbers, starter animals, screen layout, and a de-risking build order. |
| [level-builder-plan.md](./level-builder-plan.md) | **Vertical Shooter Level Builder plan** — five-minute level target, terrain/object/height layer model, grid sizing, editor UX, runtime preview phases, and open questions. |
| [architecture.md](./architecture.md) | **How we build it** — stack (Web/TS, Babylon.js, Colyseus), network topology & authority model, HD-2D rendering pipeline, renderer-agnostic game core, profiles/persistence, the Lerna monorepo layout, milestones, and technical risks. |

**Continuing the build?** Start with **`STATE.md`**, then `README.md`.
**New to the design?** `brief.md` → `prototype-meadow-run.md` → `architecture.md`.
