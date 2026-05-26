import {
  Color3,
  DynamicTexture,
  MeshBuilder,
  Plane,
  StandardMaterial,
  Texture,
  type Mesh,
  type Scene,
} from "@babylonjs/core";
import { drawGround } from "./ground-texture";
import type { GroundStyle, TileSampling, ZonePlanEntry } from "./scene-config";

const GROUND_SIZE = 512;

/**
 * One scrolling ground plane: a procedural meadow `DynamicTexture` or an image
 * tile, scrolled via UV. Two of these stacked let the zone sequencer wipe a new
 * biome in across the field — the incoming layer sits just above and is clipped
 * to "only the field beyond seamZ", and seamZ sweeps toward the camera.
 */
export interface GroundLayer {
  mesh: Mesh;
  /** advance the scroll by a world distance (matches prop speed) */
  scroll: (dist: number) => void;
  setStyle: (style: GroundStyle) => void;
  setTile: (url: string | null, repeatPerSide: number, sampling?: TileSampling) => void;
  applyLook: (entry: ZonePlanEntry) => void;
  setVOffset: (v: number) => void;
  getVOffset: () => number;
  /** show only the field where z > seamZ (a moving biome edge); null = whole plane */
  setClip: (seamZ: number | null) => void;
  setVisible: (b: boolean) => void;
  setProceduralSampling: (mode: number) => void;
  dispose: () => void;
}

export function createGroundLayer(
  scene: Scene,
  opts: { name: string; width: number; depth: number; z: number; y?: number },
): GroundLayer {
  const groundTex = new DynamicTexture(
    `${opts.name}-tex`,
    { width: GROUND_SIZE, height: GROUND_SIZE },
    scene,
    true,
  );
  groundTex.updateSamplingMode(Texture.TRILINEAR_SAMPLINGMODE);
  groundTex.wrapU = Texture.WRAP_ADDRESSMODE;
  groundTex.wrapV = Texture.WRAP_ADDRESSMODE;

  function paintGround(style: GroundStyle) {
    const tiling = drawGround(groundTex.getContext(), GROUND_SIZE, style);
    groundTex.update();
    groundTex.uScale = tiling.u;
    groundTex.vScale = tiling.v;
  }
  paintGround("painterly");

  const mat = new StandardMaterial(`${opts.name}-mat`, scene);
  mat.diffuseTexture = groundTex;
  mat.specularColor = new Color3(0, 0, 0);

  const mesh = MeshBuilder.CreateGround(opts.name, { width: opts.width, height: opts.depth }, scene);
  mesh.position.z = opts.z;
  if (opts.y) mesh.position.y = opts.y;
  mesh.material = mat;
  mesh.receiveShadows = true;

  let tileTex: Texture | null = null;
  let tileUrl: string | null = null;
  let tileSampling: TileSampling | null = null;

  function setTile(url: string | null, repeatPerSide: number, sampling: TileSampling = "nearest") {
    if (!url) {
      if (tileTex) {
        tileTex.dispose();
        tileTex = null;
        tileUrl = null;
        tileSampling = null;
      }
      mat.diffuseTexture = groundTex;
      return;
    }
    if (url === tileUrl && sampling === tileSampling && tileTex) {
      tileTex.uScale = repeatPerSide;
      tileTex.vScale = repeatPerSide;
      return;
    }
    if (tileTex) tileTex.dispose();
    const noMipmap = sampling === "nearest";
    const mode = sampling === "nearest" ? Texture.NEAREST_SAMPLINGMODE : Texture.TRILINEAR_SAMPLINGMODE;
    const t = new Texture(url, scene, noMipmap, /* invertY */ true, mode);
    t.wrapU = Texture.WRAP_ADDRESSMODE;
    t.wrapV = Texture.WRAP_ADDRESSMODE;
    t.uScale = repeatPerSide;
    t.vScale = repeatPerSide;
    t.vOffset = groundTex.vOffset; // stay in scroll phase
    tileTex = t;
    tileUrl = url;
    tileSampling = sampling;
    mat.diffuseTexture = t;
  }

  function setStyle(style: GroundStyle) {
    setTile(null, 0);
    paintGround(style);
  }

  function applyLook(entry: ZonePlanEntry) {
    if (entry.groundTile) setTile(entry.groundTile, entry.tileRepeat, entry.tileSampling);
    else setStyle(entry.ground);
  }

  const active = () => tileTex ?? groundTex;

  // per-mesh clip plane: set just before this mesh draws, clear right after, so
  // only this layer is clipped (the documented Babylon per-mesh clip pattern)
  let clipPlane: Plane | null = null;
  mesh.onBeforeRenderObservable.add(() => {
    if (clipPlane) scene.clipPlane = clipPlane;
  });
  mesh.onAfterRenderObservable.add(() => {
    if (clipPlane) scene.clipPlane = null;
  });

  return {
    mesh,
    scroll(dist) {
      const tex = active();
      tex.vOffset = (tex.vOffset + (dist * tex.vScale) / opts.depth) % 1;
    },
    setStyle,
    setTile,
    applyLook,
    setVOffset(v) {
      groundTex.vOffset = v;
      if (tileTex) tileTex.vOffset = v;
    },
    getVOffset() {
      return active().vOffset;
    },
    setClip(seamZ) {
      // Babylon discards where dot(worldPos, plane) > 0, i.e. n·p + d > 0.
      // Plane (0,0,-1, seamZ) → discards z < seamZ, keeping the FAR side, so the
      // incoming biome reveals from the horizon and sweeps toward the camera.
      clipPlane = seamZ == null ? null : new Plane(0, 0, -1, seamZ);
    },
    setVisible(b) {
      mesh.setEnabled(b);
    },
    setProceduralSampling(mode) {
      groundTex.updateSamplingMode(mode);
    },
    dispose() {
      mesh.dispose();
      mat.dispose();
      groundTex.dispose();
      tileTex?.dispose();
    },
  };
}
