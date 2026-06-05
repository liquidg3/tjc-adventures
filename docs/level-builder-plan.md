# Vertical Shooter Level Builder Plan

_Created: 2026-06-03._

This is the handoff plan for turning the current Level Builder into the real
authoring surface for the Vertical Shooter. Keep it current as decisions change.

## Goal

Build a top-down level editor where a designer authors a full five-minute
Vertical Shooter run and sees the authored level in the live 3D preview while
painting.

The editor must support three separate concepts:

- **Terrain**: the ground surface/material the player flies over.
- **Height**: ground elevation/relief, painted independently from terrain.
- **Objects**: placed models such as trees, bushes, rocks, crates, cages, fruit,
  enemies later, etc.

The Level Builder is not Test Play. It should show the level moving under the
preview camera, not a controllable player ship.

## Current State

Current files:

- `apps/studio/src/LevelBuilder.tsx`
- `apps/studio/src/level-builder-state.ts`
- `apps/studio/level-builder.json`
- `packages/scenes/src/level-prop-layer.ts`
- `packages/scenes/src/ship-scene.ts`

Implemented in the first v2 pass:

- Level data now parses to schema v2 with separate `terrain`, `height`, and
  `objects` layers.
- Legacy v1 `{prop?, height?}` JSON migrates into v2 on load.
- Default new level target is five minutes: `300s`, `16wu/s`, `4800wu`.
- Default grid is `12` columns, `384wu` field width, `32wu` cells, `150` rows.
- Level Builder modes are now `Terrain`, `Objects`, `Height`, `Erase`.
- Palette filters by mode:
  - Terrain shows curated imported catalog models marked for Level Builder terrain.
  - Objects shows curated imported catalog models marked as Level Builder objects,
    including grass, bushes, trees, buildings/landmarks, props, rescue animals, etc.
  - Height shows a numeric height ramp.
- Grid visuals combine terrain base color, dark height overlay, and object dot.
- Existing scene preview receives a legacy object/height projection for now.
- `level-prop-layer.ts` uses slot-specific target heights so trees are tall and
  bushes/rocks/fruit stay smaller.
- Object Y placement now follows painted height.
- The Level Builder component has been refactored into explicit panel/cell
  helpers (`HeaderPanel`, `LevelSettings`, `PaintPanel`, `PalettePanel`,
  `PreviewPanel`, `GridPanel`, `GridCell`) so mode-specific behavior is easier
  to audit and hand off.
- Changing grid columns now uses the custom Studio confirmation box because it
  rebuilds/clears painted layers.
- CSS cleanup removed stale Level Builder layout rules and keeps Level Builder
  panels on the shared `card-content` chrome role.
- `apps/studio/src/model-catalog.ts` now derives pack themes from Kenney pack
  names and model category/family/shape metadata from imported model names.
- `apps/studio/model-catalog-overrides.json` stores only designer curation
  overrides. Derived catalog data is rebuilt from imported manifests.
- Asset Library has inferred theme and import-state filters over the full live
  Kenney pack list, not just imported runtime folders.
- 3D Models is now catalog-only: imported-model browser with kit/theme/category
  filters, usage checkboxes, and one selected-model normalization preview. The
  old fixed-slot assignment UI is intentionally hidden.

Not implemented yet:

- Terrain mesh height/displacement.
- Diff-based object updates.
- Asset-normalization presets/overrides in `level-prop-layer.ts`.
- Confirmation/resampling workflow for changing columns without rebuilding.
  Rebuild confirmation exists; non-destructive resampling does not.
- Smart terrain brushes for connected rivers/paths. Current catalog inference
  captures `family` + `shape` to prepare for this, but neighbor-mask painting is
  not implemented yet.

Current behavior:

- Data model is v2: separate terrain/height/object layers.
- Grid defaults to `12×150`, `cellSize = 32`.
- Total current level length is `150 * 32 = 4800wu`.
- Runtime scroll speed is `SCROLL = 16wu/s`.
- Current level duration is `4800 / 16 = 300s`.
- Five minutes requires `300s * 16wu/s = 4800wu`.
- Level Builder preview hides the player ship and random scenery.
- Slider scrubs painted props and ground texture phase.
- Grid display is inverted: start at bottom, far end at top, marker moves upward.

## Core Decisions

### Five-Minute Level Length

Target runtime duration is **5 minutes**.

Required world depth:

```text
targetSeconds = 300
scrollSpeed = 16wu/s
targetWorldDepth = 4800wu
```

Depth rows should be derived from world depth and cell size:

```text
depthRows = ceil(targetWorldDepth / cellSize)
```

Examples:

| Columns | Cell size if field is 384wu wide | Rows for 4800wu | Notes |
|---:|---:|---:|---|
| 10 | 38.4wu | 125 | coarse, good for large landmarks |
| 12 | 32wu | 150 | likely practical first target |
| 24 | 16wu | 300 | detailed terrain painting |
| 32 | 12wu | 400 | current high-detail option; all columns should fit across top of preview |
| 80 | 4.8wu | 1000 | micro-editing, needs stronger grid UX |

Default recommendation:

- Use **12 columns**, **32wu cells**, **150 rows** for the first five-minute
  builder pass.
- Keep width configurable, but treat it as a level-wide setting that resamples or
  rebuilds the grid only after confirmation.

### Grid Width Controls Cell Scale

The playable field width should be fixed in world units. Grid column count
determines cell size:

```text
cellSize = fieldWorldWidth / columns
```

This makes model placement understandable:

- Fewer columns = larger cells = larger placed objects / broader terrain strokes.
- More columns = smaller cells = finer detail / smaller object footprint.

Open implementation detail:

- Current authored field width is `384wu` so 32 selected columns fit across the
  visible far/top edge of the Level Builder preview.

### Separate Layers

Terrain, height, and objects must not compete for one `prop` field.

Target schema v2:

```ts
interface LevelV2 {
  version: 2;
  durationSec: number;       // default 300
  scrollSpeed: number;       // copy of runtime speed at author time, default 16
  fieldWidth: number;        // world units across, default 384
  columns: number;           // default 12
  cellSize: number;          // fieldWidth / columns
  rows: number;              // ceil(durationSec * scrollSpeed / cellSize)
  layers: {
    terrain: TerrainCell[];  // one terrain material/slot per cell
    height: HeightCell[];    // elevation per cell
    objects: ObjectCell[];   // placed models per cell
  };
}

interface TerrainCell {
  terrain?: string;          // slot id, e.g. terrain-a
}

interface HeightCell {
  height?: number;           // 0..MAX_HEIGHT, likely expand beyond 0..3
}

interface ObjectCell {
  objects?: PlacedObject[];  // allow more than one object later
}

interface PlacedObject {
  id: string;                // stable placement id
  slot: string;              // slot id, e.g. env-trees, prop-box
  offset?: [number, number]; // local cell x/z nudge, future
  rotation?: number;         // yaw, future
  scale?: number;            // multiplier, future
}
```

Migration from v1:

- `cell.prop` migrates to `objects.objects[0].slot`.
- `cell.height` migrates to `height.height`.
- `terrain` starts empty or default-filled.

## Editor UX

### Tool Modes

Top-level modes:

- **Terrain**
- **Objects**
- **Height**
- **Erase**

Mode determines both behavior and palette content.

### Terrain Mode

Purpose:

- Paint the ground surface/material.

Palette:

- Show only terrain-relevant slots:
  - `terrain-*`
  - Grass, bushes, trees, buildings, landmarks, and props are object placements,
    not terrain.

Behavior:

- Click/drag paints terrain layer cells.
- Does not remove objects.
- Does not change height.
- Preview should update ground material/terrain representation for those cells.

### Objects Mode

Purpose:

- Place visible models on top of terrain/height.

Palette:

- Show model/object slots, not terrain:
  - `env-trees`
  - `env-tree-2`
  - `env-grass`
  - `env-bushes`
  - `env-rocks`
  - `prop-*`
  - future enemy/spawner slots

Behavior:

- Click places selected object in the cell.
- Shift/secondary action can erase object from the cell later.
- Do not change terrain.
- Do not change height.
- Object Y position follows height layer.

### Height Mode

Purpose:

- Paint elevation independently from terrain and objects.

Palette/control:

- Use a small height ramp control instead of asset slots.
- Values should be visually ordered light-to-dark or dark-to-light.
- User expectation from feedback: **darker grid color = taller**.

Behavior:

- Click/drag paints height.
- Height should show as an overlay in the grid.
- Height affects:
  - terrain/ground mesh elevation.
  - object Y placement.
  - optionally object tilt/normal alignment later.

Recommended first range:

- Expand from `0..3` to `0..8` or `0..15`.
- UI can present coarse buttons plus brush strength.
- Scene can map height to world units with `HEIGHT_STEP_WU`, e.g. `1.0wu`.

### Erase Mode

Erase should be layer-aware:

- If current mode is Terrain, clear/restore terrain cell.
- If current mode is Objects, remove object placements.
- If current mode is Height, reset height to 0.
- A full-cell erase can exist later as a separate destructive command.

## Grid UI Requirements

The five-minute grid may be hundreds or thousands of rows. Do not render or
interact with it as a simple full DOM grid long-term.

First practical target:

- `12×150` is okay with DOM buttons if optimized carefully.
- Anything above that should move to virtualization or canvas.

Controls:

- Grid columns selector: `10`, `12`, `16`, `24`, `32`, maybe custom.
- Duration selector/readout: default `5:00`.
- Derived readouts:
  - cell size in world units.
  - total rows.
  - total world depth.
  - total runtime duration.

Resizing behavior:

- Changing columns changes `cellSize` and row count.
- This is destructive or requires resampling. Use the custom confirmation box.
- First implementation can rebuild the grid after confirmation.
- Later implementation can resample layers.

Visuals:

- Keep the grid display inverted: start at bottom, far end at top.
- Marker moves upward during preview playback.
- Add a minimap/scrollbar marker for long levels so current position is visible
  even when the active row is offscreen.
- Terrain colors should be visible as the base cell fill.
- Height should be an overlay/tint where darker = taller.
- Object cells should show a small symbol/swatch or corner mark over terrain.

## Runtime Preview Requirements

### Terrain Rendering

Current ground is one scrolling texture. That is not enough for painted terrain.

First implementation options:

1. **Chunked flat terrain strips**
   - Build rows/chunks as mesh strips or tiled planes.
   - Material/color comes from terrain layer.
   - Height can be applied to vertices later.
   - Good first step for seeing authored terrain.

2. **Dynamic texture atlas**
   - Paint terrain layer into a scrolling texture.
   - More efficient, less direct for height.

Recommendation:

- Start with chunked terrain because it maps cleanly to height and object
  placement. Optimize after the authoring model proves itself.

### Height Rendering

First pass:

- Apply height to object Y placement immediately.
- Represent terrain height visually in the grid.

Second pass:

- Displace terrain mesh vertices by height layer.
- Use interpolation between cells for smoother terrain.

### Object Rendering

Current object placement issues:

- `level-prop-layer.ts` rebuilds all props on every edit.
- It scales every model with `fitScale(rootMesh, cellSize * 0.75)`, making
  trees too small or semantically wrong.
- It does not use asset normalization presets/overrides.

Target behavior:

- Diff by cell/object id and update only changed placements.
- Resolve slot to asset-map assignment.
- Apply `resolveAssetNormalization` exactly like the 3D Models board/scene ship
  path.
- Base scale should consider:
  - model normalization target.
  - object category.
  - cell size.

Scale rules:

- Terrain cells should not instantiate object models unless explicitly chosen as
  object brushes.
- Trees should be tall even in one cell.
- Bushes/rocks should be smaller.
- Crates/cages should read as object props.

Recommendation:

- Add per-slot placement defaults:

```ts
interface PlacementDefaults {
  footprintCells: number;    // e.g. tree 1, large tree 2
  targetHeightWu?: number;   // semantic height override
  scaleMode: "fit-cell" | "target-height" | "natural";
}
```

Use these defaults before adding per-placement scale controls.

## Implementation Phases

### Phase 1: Plan + Schema

- Add this plan doc.
- Define `LevelV2` types in `level-builder-state.ts`.
- Add migration from v1 JSON.
- Keep v1 parser compatibility.
- Add duration/columns/fieldWidth derived helpers.
- Update `apps/studio/level-builder.json` only through the app, not by hand,
  unless doing an explicit migration.

Exit criteria:

- Typecheck passes.
- Existing saved level loads into v2 shape.
- UI still renders current grid.

### Phase 2: Editor Modes + Filtered Palettes

- Replace current `Tool = "prop" | "height" | "erase"` with layer-aware modes:
  `terrain | objects | height | erase`.
- Categorize slots into terrain/object/height palettes.
- Terrain mode shows terrain palette only.
- Objects mode shows object slots only.
- Height mode shows height ramp only.
- Erase mode acts on selected/current layer.

Exit criteria:

- Designer can switch modes and see only relevant controls.
- Painting one layer does not destroy other layers.
- Grid visual shows terrain base + height overlay + object mark.

### Phase 3: Five-Minute Grid Settings

- Add level settings panel:
  - duration: default `5:00`.
  - columns: default `12`.
  - field width: default camera-fit value `384wu`.
  - derived cell size/rows/depth.
- Changing settings requires custom confirmation.
- First implementation may rebuild empty level.
- Preserve layer data only if a safe resampling helper is implemented.

Exit criteria:

- Default new level is five minutes.
- Preview slider range is `4800wu`.
- Grid row count matches selected columns/cell size.

### Phase 4: Runtime Terrain Layer In Progress

Session 2 started a terrain-layer prototype. The current pass made terrain cells
model-backed and materially faithful to the 3D Models board, but Phase 4 remains
open until terrain editing is efficient and height/terrain interactions are clear.

Current prototype pieces:

**Authored ground texture** (`level-terrain-layer.ts`):
- The visible terrain field is one `DynamicTexture` on a ground plane.
- Unpainted cells show the white authoring surface and grid lines.
- Painted cells with missing model assignments fall back to the editor palette
  swatch color so missing assets are still visible.
- The plane width is `columns * cellSize`, which is `384wu` by default. This is
  tuned so 32 selected columns fit across the wider far/top edge of the preview.
- Rows are mapped with the same row-major convention as objects: row 0 = far end,
  last row = start. `setScrollZ` repaints the visible window so scrubbing/playback
  moves over authored terrain.

**Assigned terrain models** (`level-terrain-layer.ts`):
- Painted terrain cells with an assigned model instantiate that GLB in the 3D
  preview. The 2D editor grid still uses solid swatches for readability.
- Terrain GLBs use the raw loader so their materials match the 3D Models board;
  they do not receive the gameplay-object material tuning used by props/ships.
- Model placement uses the same `columns`, `rows`, `cellSize`, row order, and
  scroll value as the authored grid.
- Terrain cells are exclusive. Painting terrain B over terrain A replaces that
  cell's terrain value, and model-backed tiles are scaled to the exact cell
  footprint so unlike terrain types do not overlap or z-fight at boundaries.
- Current implementation is full-rebuild on terrain edits; diffing remains a
  later performance task.

**2D grid virtualization** (`LevelBuilder.tsx:GridPanel`):
- At 32 columns the current 384wu-wide five-minute level has 400 rows = 12,800
  DOM cells. Without virtualization, React reconciles the whole grid on every
  RAF tick; with virtualization it only renders visible rows.
- `VIRTUAL_ROW_H=20px` (matches `--lb-cell-h` CSS variable on `.lb-cell`).
- `VIRTUAL_OVERSCAN=4` rows above and below the scroll viewport.
- A full-height spacer div creates the correct scrollbar; only visible rows are
  absolutely positioned inside it. `ResizeObserver` keeps the window accurate on resize.

**SceneHandle additions already made**:
- `setLevelTerrainCells(cells, width, depth, cellSize, assetUrlMap)` — sets the terrain layer.
- `getFps()` — returns `engine.getFps()` for build-time performance monitoring.

**Performance fixes already applied**:
- `level-prop-layer.ts` received the same generation counter + in-flight promise map fixes.
- `syncLevelPreviewScroll` was previously called twice per frame (once before, once after
  `levelLayer.step(dt)`). The first call was redundant — its results were always overwritten.
  Removed the first call; only the post-step sync remains.
- `countPaintedCells(level)` memoized in the parent component (was running 60×/sec).

Known gaps before Phase 4 can be called done:

- Terrain placement should become diff-based instead of full-rebuild on every edit.
- Terrain model scale/origin assumptions need more coverage across terrain assets.
- Painted terrain should support height displacement.
- Terrain should eventually support smoother joins/blends where assets permit it.
- Height can remain later, but the terrain layer should not block or hide future height
  displacement.

Exit criteria:

- Painting terrain changes the visible ground in the 3D preview in the painted cell.
- Scrubbing/playback moves over the painted terrain in sync with the grid marker.
- Terrain columns and rows line up with the 2D editor grid well enough for authoring.
- Level Builder remains responsive with the virtualized DOM grid.

### Phase 5: Height Runtime

- Apply height values to object placement Y.
- Add height displacement to terrain mesh.
- Use darker grid overlay for taller cells.

Exit criteria:

- Painting height changes grid overlay and 3D preview elevation.
- Objects placed on raised cells sit higher.

### Phase 6: Object Placement Quality

- Make `level-prop-layer.ts` diff-based.
- Apply asset normalization and placement defaults.
- Replace one-size-fits-all `cellSize * 0.75` scaling.
- Add enough per-slot defaults that trees, bushes, rocks, and crates read
  correctly.

Exit criteria:

- Painting one object cell updates only that object.
- Trees are tall, bushes short, rocks/crates readable.
- Preview remains responsive while painting.

### Phase 7: Long-Level Editing Performance Partially Done

- Row virtualization shipped as part of Phase 4 — DOM grid is now `O(visible rows)`.
- Remaining: minimap / current-position indicator for long levels.
- Remaining: jump-to-current-row control.
- Remaining: diff-based prop + terrain placement (currently full rebuild on every paint).

Exit criteria:

- Five-minute levels remain smooth to scroll, paint, and scrub.

## Open Questions

- **Field width** — `fieldWidth = 384wu` is now the Level Builder baseline.
  Old `120wu` v2 saves were too narrow; the temporary `1200wu` pass was too wide.
  Both are treated as prototype data and migrated to `384wu` on load.
- Should terrain slots be model assignments or material/texture assignments? Currently
  they're model assignments (same pipeline as object slots). Works for 3D ground-cover
  models; may need a second path for flat texture swaps later.
- Should object cells allow multiple objects per cell? Currently first-object-only.
- What height range feels right: `0..8`, `0..15`, or continuous brush strength?
- Should changing columns resample existing data or always require rebuilding?
  (Currently always rebuilds after confirmation.)
- Do we need a separate enemy/spawner layer soon, or can it follow objects later?

## Non-Goals For The Next Pass

- Enemy gameplay.
- Collision authoring.
- Fine per-object transform editing.
- Full terrain smoothing/biome blending.
- Runtime optimization beyond what is required for the five-minute editor to
  stay usable.
