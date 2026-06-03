# Level Builder — Agent Handoff Prompt

Copy-paste this as your first message to a new agent working on the Level Builder.

---

## What we're building

A top-down **Level Builder** for the Vertical Shooter game mode in TJC: Family Adventures.
The designer paints a 24×80 grid (each cell = 5 world units) with scenery props and height
levels. The 3D vertical-scroller scene runs live in the background so you can see what
the level actually looks like while you paint it.

Read `AGENTS.md` and `docs/STATE.md` first — they have the full project context.
Run `npm run dev:studio` from the repo root and navigate to `http://localhost:5174/#level`.

---

## Current state

The Level Builder (`apps/studio/src/LevelBuilder.tsx`) has:

- **Grid editor** — 24×80 cells, click/drag to paint props (by slot ID) or height (0–3).
  Persists to `apps/studio/level-builder.json` via `/__level-builder` (auto-saves).
- **Palette** — shows env/prop/terrain slots that have a model assigned in the 3D Models
  board. Each slot gets a color swatch for quick visual identification.
- **Live 3D preview** — the vertical-scroller scene (`@tjc/scenes`) renders full-screen
  behind the controls. Props from the painted grid are placed at their exact world
  positions by `packages/scenes/src/level-prop-layer.ts`.
- **Play/Pause + scrub slider** — auto-scrolls through the level at gameplay speed
  (`SCROLL = 16` world units/sec). Slider scrubs 0 → total level depth (400 wu).
  Current row is highlighted in the grid.
- **Layout** — `lb-page` is a fixed full-viewport div. The canvas fills everything;
  `.lb-sidebar` is a 320px dark panel on the left.

---

## What still needs work

The layout and UX are functional but rough. Specifically:

1. **Layout polish** — the sidebar + canvas layout works but looks unfinished. The header,
   toolbar, preview controls, grid, and palette are stacked vertically in a narrow sidebar.
   Consider whether the grid should scroll independently (it's 80 rows tall), whether the
   palette should collapse, and whether the preview controls need more visual weight.

2. **Grid ↔ scene sync** — when you paint a cell, `setLevelCells` is called with the full
   cells array, which re-loads and re-places ALL props from scratch. This is correct but
   slow for large levels. Consider a diff-based update (only rebuild changed cells).

3. **Prop scale** — `level-prop-layer.ts` uses `fitScale(rootMesh, cellSize * 0.75)` as a
   heuristic. This makes all models ~3.75 world units tall regardless of type. Trees should
   be taller, bushes shorter. The normalization preset system (`resolveAssetNormalization`)
   from `asset-normalization.ts` already handles this for the 3D Models board — wire it here.

4. **Height cells** — painted `height` values (0–3) are stored and shown in the grid but
   not yet reflected in the 3D scene. Height should raise the ground/props at those cells
   (each level = some world units of elevation). This wiring is completely missing.

5. **Scene camera** — the preview uses the same default dramatic camera as Test Play.
   Consider locking it to the gameplay camera angle (no manual flight input) so the preview
   matches what the player actually sees.

6. **Scroll looping** — when auto-scroll reaches the end of the level it stops. It should
   loop back to the start for continuous preview.

---

## Key files

- `apps/studio/src/LevelBuilder.tsx` — the page component
- `apps/studio/src/level-builder-state.ts` — grid state shape, `emptyLevel`, `cellIndex`
- `packages/scenes/src/level-prop-layer.ts` — places grid cells as 3D props; `setLevelCells`,
  `setScrollZ`, `step(dt)` — NEW this session
- `packages/scenes/src/ship-scene.ts` — scene factory; exposes `setLevelCells`,
  `setLevelScrollZ`, `setLevelScrollPaused`, `getLevelScrollZ`, `getLevelTotalDepth`
- `packages/scenes/src/scene-config.ts` — `LevelGridCell` type, `SceneHandle` interface
- `apps/studio/src/asset-normalization.ts` — `assetValueToUrl`, `resolveAssetNormalization`
- `apps/studio/src/styles.css` — `.lb-page`, `.lb-sidebar`, `.lb-bg-canvas`, `.lb-cell`

## CSS conventions to follow

- **No `!important`** — use specificity instead
- **No hardcoded hex colors** — use `var(--ui-color-*)` tokens or role vars
- **`.lb-cell` is excluded from button chrome** — `button:not(.studio-card):not(.lb-cell)`
- **Section headings** use `section h2` (or `.studio-group-label`) — uppercase, selection
  green (`--ui-color-selection`), letter-spaced, bottom border
- **`.studio` layout** is `display: flex; flex-direction: column; gap: 20px` — the Level
  Builder does NOT use `.studio` (it uses `.lb-page` instead, a fixed full-viewport div)
