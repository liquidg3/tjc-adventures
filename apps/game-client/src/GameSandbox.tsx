import { useEffect, useRef, useState } from "react";
import { createShipScene, type SceneHandle } from "@tjc/scenes";
import { applySavedScene } from "./saved-level-scene";

/** Single-player game route: mounts the authored Studio level. No server needed. */
export function GameSandbox() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const [status, setStatus] = useState("Loading saved level...");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!canvasRef.current) return;
    let cancelled = false;
    let handle: SceneHandle;
    try {
      handle = createShipScene(canvasRef.current, {
        baseGroundVisible: false,
        loadProceduralScenery: false,
        stopAtLevelEndHold: true,
      });
    } catch (e) {
      setStatus("3D unavailable on this device");
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    sceneRef.current = handle;
    handle.setPlayerShipVisible(true);
    handle.setScenery({});
    applySavedScene(handle)
      .then(() => {
        if (!cancelled) setStatus("Saved level loaded");
      })
      .catch((e) => {
        if (!cancelled) {
          setStatus("Saved level failed to load");
          setError(e?.message ?? String(e));
        }
      });
    return () => {
      cancelled = true;
      handle.dispose();
      sceneRef.current = null;
    };
  }, []);

  return (
    <div className="game-play">
      <canvas ref={canvasRef} className="game-canvas" />
      <div className="hud-hint">Arrows / WASD to fly · Shift = boost · P = pixel mode</div>
      <div className="game-status">
        <span className={error ? "error" : "dim"}>{error ? `${status}: ${error}` : status}</span>
      </div>
    </div>
  );
}
