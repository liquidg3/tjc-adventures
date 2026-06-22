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
  setVisible: (visible: boolean) => void;
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
  let shipVisible = true;
  let shipMaterials: ShipMaterialEntry[] = [];
  const shipLighting: ShipLightingState = { ...DEFAULT_SHIP_LIGHTING };

  const d2r = (deg: number) => (deg * Math.PI) / 180;

  function vec(v: Vector3) {
    return { x: round(v.x), y: round(v.y), z: round(v.z) };
  }

  function meshSummary(mesh: AbstractMesh | TransformNode | null) {
    if (!mesh) return null;
    return {
      name: mesh.name,
      uniqueId: mesh.uniqueId,
      enabled: mesh.isEnabled(),
      disposed: mesh.isDisposed(),
      position: vec(mesh.position),
      scaling: vec(mesh.scaling),
      childMeshes: mesh.getChildMeshes(false).length,
    };
  }

  function rootBounds(root: AbstractMesh) {
    const bounds = root.getHierarchyBoundingVectors(true);
    return {
      min: vec(bounds.min),
      max: vec(bounds.max),
      size: vec(bounds.max.subtract(bounds.min)),
    };
  }

  function createFallbackShip(pos = new Vector3(0, SHIP_HEIGHT, SHIP_START_Z)) {
    const box = MeshBuilder.CreateBox("ship-loading-fallback", { size: 1.5 }, scene);
    box.position.copyFrom(pos);
    box.setEnabled(shipVisible);
    ship = box;
    shipPivot = box;
    shipVisual = box;
    if (shipVisible) shadows.addCaster(box);
    dbg("ship fallback created", {
      shipVisible,
      fallback: meshSummary(box),
    });
    return box;
  }

  function applyVisualNormalization(root: AbstractMesh) {
    const beforeBounds = rootBounds(root);
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
    dbg("ship normalization applied", {
      url: shipModelUrl,
      shipUnitScale: round(shipUnitScale),
      shipSize: round(shipSize),
      finalScale: round(shipUnitScale * shipSize),
      normalization: shipNormalization,
      beforeBounds,
      afterBounds: rootBounds(root),
      root: meshSummary(root),
    });
  }

  async function loadShip() {
    const loadToken = ++shipLoadToken;
    const oldShip = ship ?? createFallbackShip();
    const oldVisual = shipVisual;
    const oldPos = ship?.position.clone() ?? new Vector3(0, SHIP_HEIGHT, SHIP_START_Z);
    const oldRoll = shipPivot?.rotation.z ?? 0;
    dbg("ship load start", {
      loadToken,
      url: shipModelUrl,
      shipVisible,
      shipSize,
      normalization: shipNormalization,
      oldShip: meshSummary(oldShip),
      oldVisual: meshSummary(oldVisual),
      oldPos: vec(oldPos),
      oldRoll: round(oldRoll),
    });
    const root = await loadModel(shipModelUrl, scene);
    dbg("ship load resolved", {
      loadToken,
      currentToken: shipLoadToken,
      url: shipModelUrl,
      hasRoot: Boolean(root),
      root: meshSummary(root),
      bounds: root ? rootBounds(root) : null,
    });
    if (loadToken !== shipLoadToken) {
      dbg("ship load stale; disposing loaded root", {
        loadToken,
        currentToken: shipLoadToken,
        url: shipModelUrl,
        root: meshSummary(root),
      });
      root?.dispose();
      return;
    }
    if (!root) {
      dbg("ship load failed; preserving fallback/current ship", {
        loadToken,
        url: shipModelUrl,
        currentShip: meshSummary(ship),
      });
      if (!ship || ship.isDisposed()) createFallbackShip(oldPos);
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
    pivot.setEnabled(shipVisible);
    shipMaterials = collectShipMaterials(root);
    applyShipLighting(shipMaterials, shipLighting);
    root.receiveShadows = true;
    for (const mesh of root.getChildMeshes(false)) mesh.receiveShadows = true;
    if (shipVisible) shadows.addCaster(root);
    if (oldVisual && oldVisual !== root) {
      shadows.removeCaster(oldVisual);
    }
    if (oldShip && oldShip !== pivot) {
      oldShip.dispose();
    }
    dbg("ship loaded", {
      loadToken,
      url: shipModelUrl,
      scale: round(shipUnitScale * shipSize),
      pivot: meshSummary(pivot),
      visual: meshSummary(root),
      visualBounds: rootBounds(root),
      shipVisible,
    });
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
      dbg("ship setModelUrl", {
        requestedUrl: url,
        currentUrl: shipModelUrl,
        sameUrl,
        sameNormalization,
        nextNormalization,
        currentShip: meshSummary(ship),
      });
      if (sameUrl && sameNormalization) return;
      shipModelUrl = url;
      shipNormalization = nextNormalization;
      void loadShip();
    },
    setVisible(visible) {
      dbg("ship setVisible", {
        requested: visible,
        current: shipVisible,
        ship: meshSummary(ship),
        visual: meshSummary(shipVisual),
      });
      if (shipVisible === visible) return;
      shipVisible = visible;
      ship?.setEnabled(visible);
      if (!shipVisual) return;
      if (visible) shadows.addCaster(shipVisual);
      else shadows.removeCaster(shipVisual);
    },
    setShipSize(size) {
      dbg("ship setShipSize", {
        requested: size,
        previous: shipSize,
        visual: meshSummary(shipVisual),
      });
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

function round(v: number) {
  return Math.round(v * 1000) / 1000;
}
