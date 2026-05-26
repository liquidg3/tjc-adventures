import { useEffect, useRef, useState } from "react";
import {
  createShipScene,
  SHIP_HEIGHT,
  SHIP_SIZE,
  type CameraRotationMode,
  type SceneHandle,
} from "@tjc/scenes";

const CAMERA_ROTATIONS: Array<{ mode: CameraRotationMode; label: string }> = [
  { mode: "none", label: "None" },
  { mode: "camera-x", label: "Camera X" },
  { mode: "camera-y", label: "Camera Y" },
  { mode: "camera-z", label: "Camera Z" },
  { mode: "rig-x", label: "Rig X" },
  { mode: "rig-y", label: "Rig Y" },
  { mode: "rig-z", label: "Rig Z" },
];

/** Local graphics sandbox: mounts the Babylon ship scene. No server needed. */
export function GameSandbox() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraRotationMode>("camera-z");
  const [altitude, setAltitude] = useState(SHIP_HEIGHT);
  const [shipSize, setShipSize] = useState(SHIP_SIZE);

  useEffect(() => {
    if (!canvasRef.current) return;
    const handle = createShipScene(canvasRef.current);
    handle.setCameraRotationMode(cameraMode);
    handle.setShipHeight(altitude);
    handle.setShipSize(shipSize);
    sceneRef.current = handle;
    return () => handle.dispose();
  }, []);

  useEffect(() => {
    sceneRef.current?.setCameraRotationMode(cameraMode);
  }, [cameraMode]);

  useEffect(() => {
    sceneRef.current?.setShipHeight(altitude);
  }, [altitude]);

  useEffect(() => {
    sceneRef.current?.setShipSize(shipSize);
  }, [shipSize]);

  return (
    <>
      <canvas ref={canvasRef} className="game-canvas" />
      <div className="hud-hint">Arrows / WASD to fly · Shift = boost · P = pixel mode</div>

      {/* left-side controls */}
      <div className="control-stack-left">
        <aside className="control-panel ship-size-panel">
          <h2>Ship Size</h2>
          <div className="slider-readout">{shipSize.toFixed(1)}</div>
          <input
            type="range"
            className="v-slider"
            min={0.5}
            max={12}
            step={0.1}
            value={shipSize}
            onChange={(e) => setShipSize(parseFloat(e.target.value))}
            aria-label="Ship size"
          />
        </aside>
      </div>

      {/* right-side controls */}
      <div className="control-stack">
        <aside className="control-panel camera-test-panel">
          <h2>Camera Rotation</h2>
          <p>Switch rotation modes while steering left and right.</p>
          <div className="camera-test-buttons">
            {CAMERA_ROTATIONS.map((test) => (
              <button
                key={test.mode}
                type="button"
                className={test.mode === cameraMode ? "active" : ""}
                onClick={() => setCameraMode(test.mode)}
              >
                {test.label}
              </button>
            ))}
          </div>
        </aside>

        <aside className="control-panel ship-altitude-panel">
          <h2>Ship Altitude</h2>
          <div className="slider-readout">{altitude.toFixed(1)}</div>
          <input
            type="range"
            className="v-slider"
            min={1}
            max={100}
            step={0.5}
            value={altitude}
            onChange={(e) => setAltitude(parseFloat(e.target.value))}
            aria-label="Ship altitude"
          />
        </aside>
      </div>
    </>
  );
}
