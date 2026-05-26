import { MeshBuilder, Vector3, type AbstractMesh, type Scene } from "@babylonjs/core";
import { dbg } from "./debug";
import {
  DEFAULT_SHIP_LIGHTING,
  DEFAULT_SHIP_MODEL_URL,
  SHIP_HEIGHT,
  SHIP_SIZE,
  SHIP_START_Z,
  SHIP_YAW,
  type ShipLightingState,
} from "./scene-config";
import {
  applyShipLighting,
  collectShipMaterials,
  fitScale,
  loadModel,
  type ShipMaterialEntry,
} from "./ship-materials";

export interface ShipController {
  loadInitialShip: () => void;
  setModelUrl: (url: string) => void;
  setShipSize: (size: number) => void;
  setShipLighting: (mutate: (state: ShipLightingState) => void) => void;
  getShipLightingState: () => ShipLightingState;
  getShipPosition: () => { x: number; y: number; z: number } | null;
  resetShip: () => void;
  getShip: () => AbstractMesh | null;
  getShipPivot: () => AbstractMesh | null;
}

interface ShadowAdapter {
  addCaster: (mesh: AbstractMesh) => void;
  removeCaster: (mesh: AbstractMesh) => void;
}

export function createShipController(
  scene: Scene,
  shadows: ShadowAdapter
): ShipController {
  let shipHeight = SHIP_HEIGHT;
  let shipSize = SHIP_SIZE;
  let shipUnitScale = 1;
  let shipModelUrl = DEFAULT_SHIP_MODEL_URL;
  let shipLoadToken = 0;
  let ship: AbstractMesh | null = null;
  let shipPivot: AbstractMesh | null = null;
  let shipMaterials: ShipMaterialEntry[] = [];
  const shipLighting: ShipLightingState = { ...DEFAULT_SHIP_LIGHTING };

  async function loadShip() {
    const loadToken = ++shipLoadToken;
    const oldShip = ship;
    const oldPos = ship?.position.clone() ?? new Vector3(0, SHIP_HEIGHT, SHIP_START_Z);
    const oldRoll = shipPivot?.rotation.z ?? 0;
    const root = await loadModel(shipModelUrl, scene);
    if (loadToken !== shipLoadToken) {
      root?.dispose();
      return;
    }
    if (!root) {
      const box = MeshBuilder.CreateBox("ship-fallback", { size: 1.5 }, scene);
      box.position.copyFrom(oldPos);
      ship = box;
      shipPivot = box;
      oldShip?.dispose();
      return;
    }
    shipUnitScale = fitScale(root, 1);
    root.scaling.setAll(shipUnitScale * shipSize);
    root.rotation = new Vector3(0, SHIP_YAW, oldRoll);
    root.position.copyFrom(oldPos);
    ship = root;
    shipPivot = root;
    shipMaterials = collectShipMaterials(root);
    applyShipLighting(shipMaterials, shipLighting);
    root.receiveShadows = true;
    for (const mesh of root.getChildMeshes(false)) mesh.receiveShadows = true;
    shadows.addCaster(root);
    if (oldShip && oldShip !== root) {
      shadows.removeCaster(oldShip);
      oldShip.dispose();
    }
    dbg("ship loaded", { scale: shipUnitScale * shipSize });
  }

  return {
    loadInitialShip() {
      void loadShip();
    },
    setModelUrl(url) {
      if (!url || url === shipModelUrl) return;
      shipModelUrl = url;
      void loadShip();
    },
    setShipSize(size) {
      shipSize = size;
      if (ship) ship.scaling.setAll(shipUnitScale * size);
    },
    setShipLighting(mutate) {
      mutate(shipLighting);
      applyShipLighting(shipMaterials, shipLighting);
    },
    getShipLightingState() {
      return { ...shipLighting };
    },
    getShipPosition() {
      return ship ? { x: ship.position.x, y: ship.position.y, z: ship.position.z } : null;
    },
    resetShip() {
      if (!ship) return;
      ship.position.x = 0;
      ship.position.z = SHIP_START_Z;
    },
    getShip() {
      return ship;
    },
    getShipPivot() {
      return shipPivot;
    },
  };
}
