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
  DODGE_DASH,
  DODGE_DURATION,
  SHIP_ACCEL,
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
  input: { vx: number; vz: number; boosting: boolean; dodge: number };
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
  let velX = 0; // smoothed velocity (world units/s) — gives the ship momentum
  let velZ = 0;
  let dodgeTimer = 0; // >0 while a barrel-roll dodge is in progress
  let dodgeDir = 0; // -1 left / +1 right
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

      // momentum: ease velocity toward the held direction, so steering builds
      // speed and releasing coasts to a stop with a little drag
      const accel = Math.min(1, dt * SHIP_ACCEL);
      velX += (input.vx * speed - velX) * accel;
      velZ += (input.vz * speed - velZ) * accel;

      // double-tap barrel roll: a one-shot full roll + a quick lateral burst to
      // juke incoming fire (ignored if already mid-roll)
      if (input.dodge !== 0 && dodgeTimer <= 0) {
        dodgeDir = input.dodge;
        dodgeTimer = DODGE_DURATION;
        velX += dodgeDir * SHIP_SPEED * DODGE_DASH;
      }

      const nearEdge = pointOnFlightPlane(col, h).z;
      const farEdge = pointOnFlightPlane(col, 0).z;
      const loZ = isFinite(Math.min(nearEdge, farEdge)) ? Math.min(nearEdge, farEdge) : 2;
      const hiZ = isFinite(Math.max(nearEdge, farEdge)) ? Math.max(nearEdge, farEdge) : 60;
      const desiredZ = ship.position.z + velZ * dt;
      const nextZ = clamp(desiredZ, loZ, hiZ);
      if (nextZ !== desiredZ) velZ = 0; // hit the top/bottom edge — shed momentum
      ship.position.z = nextZ;

      const leftEdge = pointOnFlightPlane(0, row).x;
      const rightEdge = pointOnFlightPlane(w, row).x;
      const loX = isFinite(Math.min(leftEdge, rightEdge)) ? Math.min(leftEdge, rightEdge) : -90;
      const hiX = isFinite(Math.max(leftEdge, rightEdge)) ? Math.max(leftEdge, rightEdge) : 90;
      const desiredX = ship.position.x + velX * dt;
      const nextX = clamp(desiredX, loX, hiX);
      if (nextX !== desiredX) velX = 0; // hit a side edge — shed momentum
      ship.position.x = nextX;

      ship.position.y += (shipHeight - ship.position.y) * Math.min(1, dt * 6);

      // bank + camera lean follow the actual (smoothed) lateral velocity, so the
      // ship rolls in as it accelerates and levels out as it coasts to a stop
      const latFrac = clamp(velX / speed, -1, 1);
      const targetRoll = -latFrac * SHIP_BANK_MAX;
      roll += (targetRoll - roll) * Math.min(1, dt * 10);
      let shipRoll = roll;
      if (dodgeTimer > 0) {
        dodgeTimer = Math.max(0, dodgeTimer - dt);
        const p = 1 - dodgeTimer / DODGE_DURATION; // 0 → 1 over the roll
        const eased = p * p * (3 - 2 * p); // smoothstep for a snappier spin
        shipRoll = roll + dodgeDir * Math.PI * 2 * eased; // one full revolution
      }
      if (shipPivot) shipPivot.rotation = new Vector3(0, SHIP_YAW, shipRoll);

      const testRot = -latFrac * CAMERA_TEST_ROT;
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
          cameraRotTarget.z = cameraBaseRot.z + -latFrac * CAMERA_Z_ROT;
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
