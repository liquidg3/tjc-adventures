import {
  Matrix,
  Vector3,
  type AbstractMesh,
  type FreeCamera,
  type Scene,
  type TransformNode,
} from "@babylonjs/core";
import {
  BOOST_MULT,
  CAMERA_ROT_LERP,
  CAMERA_TEST_ROT,
  CAMERA_Z_ROT,
  SHIP_BANK_MAX,
  SHIP_SPEED,
  SHIP_YAW,
  type CameraRotationMode,
} from "./scene-config";

export interface FlightStepInput {
  dt: number;
  canvas: HTMLCanvasElement;
  scene: Scene;
  camera: FreeCamera;
  cameraRig: TransformNode;
  ship: AbstractMesh;
  shipPivot: TransformNode | null;
  shipHeight: number;
  input: { vx: number; vz: number; boosting: boolean };
  pointOnFlightPlane: (screenX: number, screenY: number) => Vector3;
}

export interface FlightController {
  setCameraRotationMode: (mode: CameraRotationMode) => void;
  step: (input: FlightStepInput) => void;
}

export function createFlightController(
  camera: FreeCamera,
  cameraRig: TransformNode,
  cameraBaseRot: Vector3,
  cameraRigBaseRot: Vector3
): FlightController {
  let cameraRotationMode: CameraRotationMode = "camera-z";
  let roll = 0;
  const cameraRot = cameraBaseRot.clone();
  const cameraRotTarget = cameraBaseRot.clone();
  const rigRot = cameraRigBaseRot.clone();
  const rigRotTarget = cameraRigBaseRot.clone();

  return {
    setCameraRotationMode(mode) {
      cameraRotationMode = mode;
    },
    step({ dt, canvas, scene, camera, ship, shipPivot, shipHeight, input, pointOnFlightPlane }) {
      const speed = SHIP_SPEED * (input.boosting ? BOOST_MULT : 1);
      const w = canvas.clientWidth || scene.getEngine().getRenderWidth();
      const h = canvas.clientHeight || scene.getEngine().getRenderHeight();
      const viewport = camera.viewport.toGlobal(w, h);
      const screen = Vector3.Project(ship.position, Matrix.Identity(), scene.getTransformMatrix(), viewport);
      const col = clamp(screen.x, 0, w);
      const row = clamp(screen.y, 0, h);

      const nearEdge = pointOnFlightPlane(col, h).z;
      const farEdge = pointOnFlightPlane(col, 0).z;
      const loZ = isFinite(Math.min(nearEdge, farEdge)) ? Math.min(nearEdge, farEdge) : 2;
      const hiZ = isFinite(Math.max(nearEdge, farEdge)) ? Math.max(nearEdge, farEdge) : 60;
      ship.position.z = clamp(ship.position.z + input.vz * speed * dt, loZ, hiZ);

      const leftEdge = pointOnFlightPlane(0, row).x;
      const rightEdge = pointOnFlightPlane(w, row).x;
      const loX = isFinite(Math.min(leftEdge, rightEdge)) ? Math.min(leftEdge, rightEdge) : -90;
      const hiX = isFinite(Math.max(leftEdge, rightEdge)) ? Math.max(leftEdge, rightEdge) : 90;
      ship.position.x = clamp(ship.position.x + input.vx * speed * dt, loX, hiX);

      ship.position.y += (shipHeight - ship.position.y) * Math.min(1, dt * 6);
      const targetRoll = -input.vx * SHIP_BANK_MAX;
      roll += (targetRoll - roll) * Math.min(1, dt * 10);
      if (shipPivot) shipPivot.rotation = new Vector3(0, SHIP_YAW, roll);

      const testRot = -input.vx * CAMERA_TEST_ROT;
      cameraRotTarget.copyFrom(cameraBaseRot);
      rigRotTarget.copyFrom(cameraRigBaseRot);
      switch (cameraRotationMode) {
        case "camera-x":
          cameraRotTarget.x = cameraBaseRot.x + testRot;
          break;
        case "camera-y":
          cameraRotTarget.y = cameraBaseRot.y + testRot;
          break;
        case "camera-z":
          cameraRotTarget.z = cameraBaseRot.z + -input.vx * CAMERA_Z_ROT;
          break;
        case "rig-x":
          rigRotTarget.x = cameraRigBaseRot.x + testRot;
          break;
        case "rig-y":
          rigRotTarget.y = cameraRigBaseRot.y + testRot;
          break;
        case "rig-z":
          rigRotTarget.z = cameraRigBaseRot.z + testRot;
          break;
        case "none":
        default:
          break;
      }

      const rotMix = Math.min(1, dt * CAMERA_ROT_LERP);
      cameraRot.x += (cameraRotTarget.x - cameraRot.x) * rotMix;
      cameraRot.y += (cameraRotTarget.y - cameraRot.y) * rotMix;
      cameraRot.z += (cameraRotTarget.z - cameraRot.z) * rotMix;
      rigRot.x += (rigRotTarget.x - rigRot.x) * rotMix;
      rigRot.y += (rigRotTarget.y - rigRot.y) * rotMix;
      rigRot.z += (rigRotTarget.z - rigRot.z) * rotMix;
      camera.rotation.copyFrom(cameraRot);
      cameraRig.rotation.copyFrom(rigRot);
    },
  };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
