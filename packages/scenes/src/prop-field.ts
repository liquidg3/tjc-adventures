import { Vector3, type Scene, type TransformNode } from "@babylonjs/core";
import { FIELD_DEPTH, SCROLL } from "./scene-config";
import { dbg, dbgError } from "./debug";
import { fitScale, loadModel } from "./ship-materials";

export interface PropInstance {
  node: TransformNode;
  speedMul: number;
}

export interface PropFieldController {
  props: PropInstance[];
  scatter: (url: string, count: number, targetH: number) => Promise<void>;
  update: (dt: number) => void;
}

export function createPropFieldController(scene: Scene): PropFieldController {
  const props: PropInstance[] = [];

  async function scatter(url: string, count: number, targetH: number) {
    const template = await loadModel(url, scene);
    if (!template) {
      dbgError("prop failed", url);
      return;
    }
    const s = fitScale(template, targetH);
    const nodes: TransformNode[] = [template];
    for (let i = 1; i < count; i++) {
      const inst = template.instantiateHierarchy(null);
      if (inst) nodes.push(inst as TransformNode);
    }
    for (const node of nodes) {
      node.scaling.setAll(s);
      placeProp(node);
      // props catch the ship's shadow (otherwise it slides under the rocks)
      for (const mesh of node.getChildMeshes()) mesh.receiveShadows = true;
      props.push({ node, speedMul: 0.9 + Math.random() * 0.2 });
    }
    dbg("prop scattered", { url, count: nodes.length, scale: s });
  }

  function update(dt: number) {
    for (const prop of props) {
      prop.node.position.z -= SCROLL * dt;
      if (prop.node.position.z < -40) {
        prop.node.position.z += FIELD_DEPTH;
        prop.node.position.x = (Math.random() * 2 - 1) * 70;
      }
    }
  }

  return { props, scatter, update };
}

function placeProp(node: TransformNode) {
  node.position.set((Math.random() * 2 - 1) * 70, 0, Math.random() * FIELD_DEPTH);
  node.rotation = new Vector3(0, Math.random() * Math.PI * 2, 0);
}
