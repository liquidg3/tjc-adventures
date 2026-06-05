# Smart Terrain Painting Plan

_Created: 2026-06-05._

This plan expands Phase 6 of `docs/level-builder-plan.md`: connected terrain
painting for roads/rivers/paths in the Vertical Shooter Level Builder.

## Goal

Make terrain painting express designer intent.

The designer should paint "river goes here" or "path goes here", not manually
hunt for `straight`, `corner`, `end`, `split`, and `cross` GLBs. The editor
should infer the needed tile shape and rotation from neighboring painted cells,
while still allowing manual art-directed overrides.

## Current Foundation

Already built:

- `#assets` browses the live Kenney catalog and imports packs.
- `#models` is catalog-only:
  - imported model browser.
  - kit/theme/category filters.
  - usage flags.
  - selected-model normalization preview/editor.
- `apps/studio/src/model-catalog.ts` infers:
  - pack theme.
  - model category.
  - terrain family, e.g. `river`, `path`, `road`.
  - terrain shape, e.g. `straight`, `corner`, `end`, `split`, `cross`, `tile`.
- `#level` visible palette reads curated catalog models only.
- Terrain rendering can instantiate model-backed terrain cells in the 3D preview.

Known limits:

- Terrain edits still rebuild the terrain layer.
- Height does not displace terrain yet.
- Level storage currently has one `terrain?: string` field per terrain cell.
- Old slot IDs are still readable internally for saved-level compatibility.

## Product Behavior

Terrain mode should have brush sub-modes:

- **Manual Tile**: paint the exact selected catalog model.
- **Connected Feature**: paint a feature family such as river/path/road; the
  editor chooses shape + rotation.

First pass target:

- Support Kenney Nature Kit `river`.
- Use four-direction orthogonal connectivity only.
- Recompute changed cell plus N/E/S/W neighbors.
- Keep manual tile override available.

Later:

- Add Kenney Nature Kit `path`.
- Add roads/city kits.
- Add diagonal/soft transitions only if the asset packs support them.
- Add terrain blending/material paths if flat texture terrain becomes necessary.

## Data Model Direction

Do not store only the resolved GLB forever. Store intent plus resolved model.

Proposed additive shape:

```ts
type TerrainFeatureFamily = "river" | "path" | "road";
type TerrainShape = "straight" | "corner" | "end" | "split" | "cross" | "tile";
type TerrainRotation = 0 | 90 | 180 | 270;

interface TerrainFeatureCell {
  family: TerrainFeatureFamily;
  shape: TerrainShape;
  rotation: TerrainRotation;
  modelId: string;      // catalog model value, e.g. model:kenney-nature-kit/ground_riverCorner
  manual?: boolean;     // true means do not auto-recompute this cell
}

interface TerrainCell {
  terrain?: string;             // current resolved model value, kept for renderer compatibility
  feature?: TerrainFeatureCell; // connected-feature intent
}
```

Why keep both `terrain` and `feature.modelId` initially:

- The current renderer already consumes `terrain`.
- Legacy/manual terrain stays simple.
- Smart terrain can migrate incrementally without blocking the preview.
- Connected-feature paint must keep them synchronized: every resolved feature
  write also writes `terrain = feature.modelId`; erasing clears both.

Potential later cleanup:

- Rename `terrain` to `modelId` in a schema v3.
- Split terrain into `baseTerrain` and `featureTerrain` once we need grass under
  rivers/roads instead of one terrain model per cell.

## Connectivity Algorithm

Use a four-bit neighbor mask:

```ts
const N = 1;
const E = 2;
const S = 4;
const W = 8;
```

For a target cell:

1. Check N/E/S/W neighbors.
2. A neighbor connects if:
   - it has `feature.family === target.family`.
   - `feature.manual` does not block connectivity; manual cells of the same
     family still count as neighbors.
3. Build mask.
4. Convert mask to `shape + rotation`.
5. Resolve `shape + family` to a catalog model.
6. Store `feature` and `terrain = feature.modelId`.

Shape mapping:

| Mask kind | Shape | Rotation rule |
|---|---|---|
| 0 neighbors | `tile` or `end` fallback | `0` |
| 1 neighbor | `end` | points toward neighbor |
| 2 opposite neighbors | `straight` | vertical for N/S, horizontal for E/W |
| 2 adjacent neighbors | `corner` | connects the two adjacent directions |
| 3 neighbors | `split` | missing side determines rotation |
| 4 neighbors | `cross` | `0` |

Fallbacks:

- Missing `cross` can fallback to `split`.
- Missing `split` can fallback to `cross`, then `straight`, with a warning badge.
- Missing `end` can fallback to `straight`.
- Missing `tile` can fallback to `end`, then `straight`.

Fallbacks must be visible in UI/debug output so the designer knows a kit lacks a
matching tile.

If a feature cell has no resolved `terrain` yet, `countPaintedCells` should count
the `feature` field so painted-but-unresolved work is still visible in summary
readouts.

## Rotation Convention

Define a renderer-independent convention first.

Recommended convention:

- `rotation = 0` means the source model's canonical orientation.
- The catalog resolver decides which mask maps to which rotation for a family.
- Do not assume every Kenney model is authored with the same forward direction.

Add future override support:

```ts
interface TerrainModelOverride {
  baseRotation?: TerrainRotation;
  shape?: TerrainShape;
  family?: TerrainFeatureFamily;
}
```

This can live in `model-catalog-overrides.json` later if needed.

First implementation can use fixed per-shape rotation tables for Kenney Nature
Kit and adjust once visually inspected.

Required renderer support:

- `LevelTerrainCell` in `packages/scenes/src/level-terrain-layer.ts` needs
  `rotation?: number` in degrees.
- `loadAndPlaceTerrain` must apply `node.rotation.y = rotation * Math.PI / 180`
  to instantiated terrain nodes.
- `LevelBuilder.tsx` must pass `cell.feature?.rotation` through to
  `setLevelTerrainCells`.

Without this, connected corners/splits can resolve correctly in data but still
render in the wrong orientation.

## Catalog Lookup

Build a lookup from curated catalog items:

```ts
type TerrainModelLookup = Record<
  TerrainFeatureFamily,
  Partial<Record<TerrainShape, ModelCatalogItem[]>>
>;
```

Source models:

- `usage.showInLevelBuilder === true`
- `usage.terrain === true`
- `categoryKind === "terrain"`
- `family` in `river | path | road`
- `shape` inferred or overridden

If multiple models match the same `family + shape`:

1. Prefer active kit/theme.
2. Prefer exact pack selected in Level Builder.
3. Prefer non-variant base names first.
4. Otherwise use stable alphabetical order.

Later UI can let the designer choose the variant set.

Kenney Nature Kit variant decision for first pass:

- Treat `straight`, `end`, `split`, and `cross` as direct shape matches.
- Treat `corner` as the first-pass 90-degree turn shape.
- Exclude `bend`, `bendBank`, `cornerSmall`, `side`, `sideOpen`, `rocks`, and
  other decorative variants from automatic lookup unless explicitly curated as
  the active shape in `model-catalog-overrides.json`.
- `open` must be visually inspected before use; do not assume it means `tile`.

This avoids silently choosing a decorative/tight/gentle variant when the designer
expects a basic connected river tile.

## Editor UX

Terrain panel should show:

- Brush type segmented control:
  - Manual Tile
  - Connected Feature
- If Manual Tile:
  - current catalog terrain palette.
- If Connected Feature:
  - feature family selector: River / Path / Road.
  - active kit/theme selector.
  - optional variant-set selector later.
  - "Rebuild Connections" command.

Cell interactions:

- Click/drag in Connected Feature paints the chosen family.
- Erase removes feature and terrain for that cell.
- Recompute target + neighbors after every paint/erase.
- Manual Tile sets `feature.manual = true` or clears `feature` and stores only
  `terrain`, depending on how strict we want manual overrides to be.

Grid visuals:

- Keep solid swatch colors for readability.
- Add small glyph/marker for connected feature cells later:
  - line/corner hint, or
  - tooltip with `river corner 90`.

3D preview:

- Uses resolved `terrain` model ID, so no renderer rewrite is needed in the
  first pass.

## Implementation Steps

### Step 1: Data Types + Migration

Files:

- `apps/studio/src/level-builder-state.ts`

Tasks:

- Add optional `feature` to `TerrainCell`.
- Add parse/merge validation for `feature` in `mergeTerrainLayer`.
- Keep old `{ terrain }` cells valid.
- Update `countPaintedCells` to count `feature` cells even if `terrain` is not
  resolved yet.
- Ensure autosaved JSON stays compact.

Done when:

- Existing level JSON loads unchanged.
- New `feature` data round-trips.

### Step 2: Terrain Model Lookup

Files:

- `apps/studio/src/model-catalog.ts`
- maybe new `apps/studio/src/terrain-feature-resolver.ts`

Tasks:

- Build lookup from catalog items by `family + shape`.
- Add fallback resolution helper.
- Add runtime guards for `TerrainFeatureFamily` because
  `ModelCatalogItem.family` is currently a string.
- Implement or document the first-pass Kenney river variant exclusions.
- Keep helper pure and testable.

Core API:

```ts
function buildTerrainFeatureLookup(models: ModelCatalogItem[]): TerrainModelLookup;

function resolveTerrainFeatureModel(
  lookup: TerrainModelLookup,
  family: TerrainFeatureFamily,
  shape: TerrainShape,
  activePackId?: string,
): ModelCatalogItem | null;
```

Done when:

- First slice: Nature Kit river models resolve by inferred metadata.
- Later slices: Nature Kit path models resolve by inferred metadata.
- Missing shapes return clear fallback metadata.

### Step 3: Connectivity Resolver

Files:

- new `apps/studio/src/terrain-connectivity.ts`

Tasks:

- Implement mask calculation.
- Implement mask → shape/rotation mapping.
- Add a visual-inspection sub-step for Kenney river:
  - inspect `ground_riverStraight`, `ground_riverCorner`,
    `ground_riverEnd`, `ground_riverSplit`, `ground_riverCross`.
  - record canonical orientation for each model.
  - build a constant rotation table, not inline ad hoc rotations.
- Add renderer rotation support in `level-terrain-layer.ts`.
- Keep independent from React.

Core API:

```ts
function terrainMaskForCell(
  cells: TerrainCell[],
  columns: number,
  rows: number,
  col: number,
  row: number,
  family: TerrainFeatureFamily,
): number;

function terrainShapeForMask(mask: number): {
  shape: TerrainShape;
  rotation: TerrainRotation;
};
```

Done when:

- Unit tests or fixture assertions cover all 16 masks.
- A terrain cell passed with non-zero rotation visibly rotates in the 3D preview.

### Step 4: Paint Operations

Files:

- `apps/studio/src/LevelBuilder.tsx`
- maybe new `apps/studio/src/level-terrain-actions.ts`

Tasks:

- Add connected-feature paint function.
- Paint target cell.
- Recompute target + N/E/S/W neighbors.
- Erase target cell and recompute neighbors.
- Preserve manual cells unless explicitly overwritten.
- For every connected-feature write:
  - resolve `modelId`.
  - write `feature = { family, shape, rotation, modelId }`.
  - write `terrain = modelId`.
- For erase:
  - clear both `feature` and `terrain`.
- Pass `feature.rotation` to `LevelTerrainCell.rotation`.

Done when:

- First slice: dragging a river updates adjacent shapes immediately in the 2D
  grid and 3D preview.
- Later slices: the same behavior works for paths/roads.

### Step 5: UI Controls

Files:

- `apps/studio/src/LevelBuilder.tsx`
- `apps/studio/src/styles.css`

Tasks:

- Add Terrain brush sub-mode control.
- Add feature family selector.
- Add active kit/theme selector if lookup has multiple packs.
- Add Rebuild Connections button.
- Keep controls compact in the existing panel layout.

Done when:

- First slice: designer can switch between manual tile painting and connected
  river painting without leaving Terrain mode.
- Later slices: path/road families are selectable too.

### Step 6: Rebuild Command

Files:

- `apps/studio/src/level-terrain-actions.ts`

Tasks:

- Iterate all feature cells.
- Recompute any non-manual feature cell.
- Preserve manual overrides.
- Report unresolved/fallback count. A first pass may use `console.warn` with
  cell coordinates and requested `family + shape`; later this should become a
  visible badge/readout.

Done when:

- Existing connected-feature terrain can be repaired after model curation changes.

### Step 7: Verification

Manual checks:

- Paint a straight river.
- Paint a corner.
- Paint a T split.
- Paint a cross.
- Erase a middle cell and verify neighbors become ends/corners.
- Scrub preview and confirm resolved models move with terrain.
- Reload page and confirm feature data persists.

Automated checks:

- Typecheck.
- Pure resolver tests if test framework exists or lightweight script assertions
  if no test runner is configured for Studio utilities.

## Edge Cases

- No model for required shape.
- Multiple matching models for shape.
- Mixed families adjacent to each other.
- Manual override adjacent to smart feature.
- Painting over manual tile.
- Erasing a junction.
- Active kit lacks `split`/`cross`.
- Rotation mismatch between model authoring and expected orientation.
- `feature` exists without a resolved `terrain`.

## Risks

- **Asset orientation mismatch:** solve with a small override system or family
  rotation table.
- **Renderer mismatch:** terrain rotation must be implemented before connected
  shapes can be trusted visually.
- **Asset coverage gaps:** solve with fallbacks and visible warnings.
- **Data model churn:** keep `terrain` as resolved model ID for now, add
  `feature` as optional metadata.
- **Performance:** recompute only target + neighbors; terrain renderer still
  full-rebuilds, but this phase does not make that worse than current painting.
- **UX overload:** keep first pass to Manual Tile vs Connected Feature, then add
  advanced controls only after the behavior is useful.

## Recommended First Slice

Implement only:

- Kenney Nature Kit `river`.
- Connected Feature brush.
- All 16 mask mappings.
- Renderer rotation.
- `feature` parse/merge round-trip.
- Fallback logging can be minimal.
- Manual Tile still works.

Then expand to:

- `path`.
- active kit selector.
- Rebuild Connections.
- manual override polish.

This keeps the first pass testable and visually obvious.

## First Slice Task Order

This is the minimum path to a demonstrable connected river.

### A. Data + Persistence

Files:

- `apps/studio/src/level-builder-state.ts`

Tasks:

- Add `TerrainFeatureFamily`, `TerrainShape`, `TerrainRotation`,
  `TerrainFeatureCell`.
- Add `feature?: TerrainFeatureCell` to `TerrainCell`.
- Update `mergeTerrainLayer` to preserve valid `feature` data.
- Update `countPaintedCells` to count `feature`.

Done when:

- Existing JSON loads unchanged.
- A feature cell survives save/reload.

### B. Renderer Rotation

Files:

- `packages/scenes/src/level-terrain-layer.ts`
- `packages/scenes/src/scene-config.ts` if the shared type also needs the field.

Tasks:

- Add `rotation?: number` in degrees to the terrain cell passed to the renderer.
- Apply Y rotation to instantiated terrain nodes.
- Keep existing non-rotated terrain behavior unchanged.

Done when:

- A manually constructed terrain preview cell with `rotation: 90` renders rotated.

### C. River Lookup + Rotation Table

Files:

- new `apps/studio/src/terrain-feature-resolver.ts`
- maybe `apps/studio/src/model-catalog.ts`

Tasks:

- Build the river-only lookup from curated catalog items.
- Exclude ambiguous decorative variants from automatic lookup.
- Visually inspect Kenney river base models.
- Add a concrete rotation table.

Done when:

- `river + straight/end/corner/split/cross` resolve to expected model IDs.
- The rotation table is explicit and reviewable.

### D. Connectivity Resolver

Files:

- new `apps/studio/src/terrain-connectivity.ts`

Tasks:

- Implement all 16 masks.
- Return `{ shape, rotation }`.
- Treat same-family manual cells as connected neighbors.

Done when:

- Fixture assertions cover every mask.

### E. Paint Wiring

Files:

- `apps/studio/src/LevelBuilder.tsx`
- optionally new `apps/studio/src/level-terrain-actions.ts`

Tasks:

- Add connected river paint operation.
- Paint target and recompute target + N/E/S/W.
- Erase target and recompute neighbors.
- Always write both `feature` and resolved `terrain`.
- Pass `feature.rotation` to `setLevelTerrainCells`.

Done when:

- Dragging river cells updates shape/rotation in grid state and 3D preview.

### F. Minimal UI

Files:

- `apps/studio/src/LevelBuilder.tsx`
- `apps/studio/src/styles.css`

Tasks:

- Add Terrain brush sub-mode:
  - Manual Tile.
  - Connected River.
- Do not add kit selector, variant selector, or Rebuild Connections yet.

Done when:

- Designer can switch to Connected River and paint a connected river line.

Defer to second slice:

- `path` family.
- Rebuild Connections.
- active kit/theme selector.
- fallback badges.
- manual override polish.
