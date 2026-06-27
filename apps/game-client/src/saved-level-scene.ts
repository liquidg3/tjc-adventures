import {
  type LevelGridCell,
  type LevelTerrainCell,
  type SceneHandle,
} from "@tjc/scenes";
import {
  assetValueToUrl,
  getNormalizationPreset,
  mergeNormalizationOverrides,
  mergeNormalizationPresets,
  parseAssetAssignments,
  resolveAssetNormalization,
} from "../../studio/src/asset-normalization";
import {
  emptyLevel,
  mergeLevel,
  projectObjectsToLegacyCells,
} from "../../studio/src/level-builder-state";
import { loadStagedModels } from "../../studio/src/3d-models-data";
import {
  buildModelCatalog,
  EMPTY_MODEL_CATALOG_OVERRIDES,
  parseModelCatalogOverrides,
} from "../../studio/src/model-catalog";
import {
  mergeDefaults,
  type VerticalDefaults,
} from "../../studio/src/vertical-test-play-state";

export async function applySavedScene(scene: SceneHandle) {
  const [
    assetMapData,
    presetData,
    overrideData,
    verticalDefaultsData,
    levelData,
    catalogOverrideData,
    modelEntries,
  ] = await Promise.all([
    fetchJson("/__asset-map"),
    fetchJson("/__asset-normalization-presets"),
    fetchJson("/__asset-normalization-overrides"),
    fetchJson("/__vertical-defaults"),
    fetchJson("/__level-builder"),
    fetchJson("/__model-catalog-overrides").catch(() => EMPTY_MODEL_CATALOG_OVERRIDES),
    loadStagedModels(),
  ]);

  const defaults = mergeDefaults(verticalDefaultsData as Partial<VerticalDefaults>);
  const level = mergeLevel(levelData ?? emptyLevel());
  const assignments = parseAssetAssignments(assetMapData);
  const presets = mergeNormalizationPresets(presetData);
  const overrides = mergeNormalizationOverrides(overrideData);
  const catalog = buildModelCatalog(modelEntries, parseModelCatalogOverrides(catalogOverrideData));

  const assetUrlMap: Record<string, string> = {};
  for (const [id, entry] of Object.entries(assignments)) {
    if (id.startsWith("ship-")) continue;
    const url = assetValueToUrl(entry.model);
    if (url) assetUrlMap[id] = url;
  }
  for (const model of catalog) assetUrlMap[model.modelValue] = model.url;

  const playerAssignment = assignments["ship-player"];
  const playerShip = assetValueToUrl(playerAssignment?.model);
  if (playerShip && playerAssignment) {
    scene.setPlayerShipModel(
      playerShip,
      resolveAssetNormalization(
        getNormalizationPreset(presets, playerAssignment.preset),
        overrides[playerAssignment.model],
      ),
    );
  }

  scene.setCameraRotationMode(defaults.cameraMode);
  scene.setShipHeight(defaults.altitude);
  scene.setShipSize(playerShip ? defaults.shipSizeByModel[playerShip] ?? defaults.shipSize : defaults.shipSize);
  scene.setPixelScale(defaults.pixelLevel);
  scene.setRtHeight(defaults.rtHeight);
  scene.setPipelineMode(defaults.pipelineMode);
  scene.setLevelPlan(null);
  scene.setScenery({});
  scene.setLightingPreset(defaults.lighting);
  scene.setSunIntensity(defaults.sunI);
  scene.setSkyIntensity(defaults.skyI);
  scene.setSunAzimuth(defaults.azimuth);
  scene.setSunElevation(defaults.elevation);
  scene.setShipLightDirectIntensity(defaults.shipLight.directIntensity);
  scene.setShipLightEnvironmentIntensity(defaults.shipLight.environmentIntensity);
  scene.setShipLightRoughness(defaults.shipLight.roughness);
  scene.setShipLightSpecularIntensity(defaults.shipLight.specularIntensity);
  scene.setShipLightExposure(defaults.shipLight.exposure);
  scene.setShipLightContrast(defaults.shipLight.contrast);
  scene.setShipLightAlbedoBoost(defaults.shipLight.albedoBoost);
  scene.setShipLightAmbientStrength(defaults.shipLight.ambientStrength);
  scene.setLevelCells(
    projectObjectsToLegacyCells(level) as LevelGridCell[],
    level.columns,
    level.rows,
    level.cellSize,
    assetUrlMap,
  );
  scene.setLevelTerrainRenderWindowRows(
    level.preview.terrainRenderRowsBack,
    level.preview.terrainRenderRowsForward,
  );
  scene.setLevelTerrainCells(
    level.layers.terrain.map((cell) => ({
      terrain: cell.terrain,
      rotation: cell.feature?.rotation ?? cell.rotation,
    })) as LevelTerrainCell[],
    level.columns,
    level.rows,
    level.cellSize,
    assetUrlMap,
  );
  scene.setLevelScrollPaused(false);
}

async function fetchJson(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
