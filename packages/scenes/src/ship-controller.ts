import { MeshBuilder, TransformNode, Vector3, type AbstractMesh, type Scene } from "@babylonjs/core";
import { dbg } from "./debug";
import {
  DEFAULT_SHIP_LIGHTING,
  DEFAULT_SHIP_MODEL_URL,
  SHIP_HEIGHT,
  SHIP_MODEL_FORWARD_YAW,
  SHIP_SIZE,
  SHIP_START_Z,
  SHIP_YAW,
  type ShipModelNormalization,
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
  setModelUrl: (url: string, normalization?: ShipModelNormalization) => void;
  setShipSize: (size: number) => void;
  setShipLighting: (mutate: (state: ShipLightingState) => void) => void;
  getShipLightingState: () => ShipLightingState;
  getShipPosition: () => { x: number; y: number; z: number } | null;
  resetShip: () => void;
  getShip: () => TransformNode | null;
  getShipPivot: () => TransformNode | null;
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
  let shipNormalization: ShipModelNormalization = {
    orient: [0, 0, 0],
    offset: [0, 0, 0],
    anchor: "none",
  };
  let shipLoadToken = 0;
  let ship: TransformNode | null = null;
  let shipPivot: TransformNode | null = null;
  let shipVisual: AbstractMesh | null = null;
  let shipMaterials: ShipMaterialEntry[] = [];
  const shipLighting: ShipLightingState = { ...DEFAULT_SHIP_LIGHTING };

  const d2r = (deg: number) => (deg * Math.PI) / 180;

  function applyVisualNormalization(root: AbstractMesh) {
    root.scaling.setAll(shipUnitScale * shipSize);
    root.rotation = new Vector3(
      d2r(shipNormalization.orient[0]),
      d2r(shipNormalization.orient[1]) + SHIP_MODEL_FORWARD_YAW,
      d2r(shipNormalization.orient[2]),
    );
    root.position.setAll(0);
    const bounds = root.getHierarchyBoundingVectors(true);
    const center = Vector3.Center(bounds.min, bounds.max);
    const anchor =
      shipNormalization.anchor === "bottom-center"
        ? new Vector3(center.x, bounds.min.y, center.z)
        : shipNormalization.anchor === "center"
          ? center
          : Vector3.Zero();
    root.position = anchor.scale(-1).add(
      new Vector3(
        shipNormalization.offset[0],
        shipNormalization.offset[1],
        shipNormalization.offset[2],
      ),
    );
  }

  async function loadShip() {
    const loadToken = ++shipLoadToken;
    const oldShip = ship;
    const oldVisual = shipVisual;
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
      shipVisual = box;
      if (oldVisual) shadows.removeCaster(oldVisual);
      oldShip?.dispose();
      return;
    }
    const pivot = new TransformNode("ship-pivot", scene);
    shipUnitScale = fitScale(root, 1);
    root.parent = pivot;
    applyVisualNormalization(root);
    pivot.position.copyFrom(oldPos);
    pivot.rotation = new Vector3(0, SHIP_YAW, oldRoll);
    ship = pivot;
    shipPivot = pivot;
    shipVisual = root;
    shipMaterials = collectShipMaterials(root);
    applyShipLighting(shipMaterials, shipLighting);
    root.receiveShadows = true;
    for (const mesh of root.getChildMeshes(false)) mesh.receiveShadows = true;
    shadows.addCaster(root);
    if (oldVisual && oldVisual !== root) {
      shadows.removeCaster(oldVisual);
    }
    if (oldShip && oldShip !== pivot) {
      oldShip.dispose();
    }
    dbg("ship loaded", { scale: shipUnitScale * shipSize });
  }

  return {
    loadInitialShip() {
      void loadShip();
    },
    setModelUrl(url, normalization) {
      if (!url) return;
      const nextNormalization = normalization ?? {
        orient: [0, 0, 0],
        offset: [0, 0, 0],
        anchor: "none" as const,
      };
      const sameUrl = url === shipModelUrl;
      const sameNormalization = JSON.stringify(nextNormalization) === JSON.stringify(shipNormalization);
      if (sameUrl && sameNormalization) return;
      shipModelUrl = url;
      shipNormalization = nextNormalization;
      void loadShip();
    },
    setShipSize(size) {
      shipSize = size;
      if (shipVisual) applyVisualNormalization(shipVisual);
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
