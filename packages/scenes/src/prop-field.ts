import { Vector3, type Scene, type TransformNode } from "@babylonjs/core";
import {
  FIELD_DEPTH,
  SCENERY_MODELS,
  SCROLL,
  type SceneryDensities,
  type SceneryKey,
} from "./scene-config";
import { dbg, dbgError } from "./debug";
import { fitScale, loadModel } from "./ship-materials";

/**
 * Streams scenery toward the camera. One instance pool per model; each instance
 * has a fixed random `rank` (0..1) and is shown only where its model's climate
 * density exceeds that rank. The density is read from the live climate at the
 * instance's world-Z — but only re-evaluated when the instance recycles at the
 * far edge, so scenery fades in/out at the horizon (in step with the ground
 * climate seam) and never pops in mid-field.
 */
interface Prop {
  node: TransformNode;
  key: SceneryKey;
  rank: number;
  enabled: boolean;
}

export interface PropFieldController {
  loadScenery: (perModel: number) => Promise<void>;
  setDensityProvider: (fn: (z: number) => SceneryDensities) => void;
  setVisible: (visible: boolean) => void;
  update: (dt: number) => void;
}

export function createPropFieldController(scene: Scene): PropFieldController {
  const props: Prop[] = [];
  let densityAt: (z: number) => SceneryDensities = () => ({});
  let visible = true;

  function place(node: TransformNode) {
    node.position.set((Math.random() * 2 - 1) * 70, 0, Math.random() * FIELD_DEPTH);
    node.rotation = new Vector3(0, Math.random() * Math.PI * 2, 0);
  }

  function evaluate(p: Prop) {
    const d = densityAt(p.node.position.z)[p.key] ?? 0;
    const on = p.rank < d;
    if (on !== p.enabled) {
      p.node.setEnabled(visible && on);
      p.enabled = on;
    }
  }

  async function loadScenery(perModel: number) {
    for (const key of Object.keys(SCENERY_MODELS) as SceneryKey[]) {
      const spec = SCENERY_MODELS[key];
      const template = await loadModel(spec.url, scene);
      if (!template) {
        dbgError("scenery failed", spec.url);
        continue;
      }
      const s = fitScale(template, spec.targetH);
      const nodes: TransformNode[] = [template];
      for (let i = 1; i < perModel; i++) {
        const inst = template.instantiateHierarchy(null);
        if (inst) nodes.push(inst as TransformNode);
      }
      for (const node of nodes) {
        node.scaling.setAll(s);
        place(node);
        for (const m of node.getChildMeshes()) m.receiveShadows = true; // catch the ship's shadow
        const p: Prop = { node, key, rank: Math.random(), enabled: true };
        node.setEnabled(false);
        p.enabled = false;
        evaluate(p);
        props.push(p);
      }
    }
    dbg("scenery loaded", { models: Object.keys(SCENERY_MODELS).length, perModel });
  }

  function setDensityProvider(fn: (z: number) => SceneryDensities) {
    densityAt = fn;
  }

  function update(dt: number) {
    if (!visible) return;
    const move = SCROLL * dt;
    for (const p of props) {
      p.node.position.z -= move;
      if (p.node.position.z < -40) {
        p.node.position.z += FIELD_DEPTH;
        p.node.position.x = (Math.random() * 2 - 1) * 70;
        p.node.rotation.y = Math.random() * Math.PI * 2;
        evaluate(p); // re-fit to the climate only at the (off-screen) far edge
      }
    }
  }

  function setVisible(nextVisible: boolean) {
    visible = nextVisible;
    for (const p of props) {
      p.node.setEnabled(visible && p.enabled);
    }
  }

  return { loadScenery, setDensityProvider, setVisible, update };
}
