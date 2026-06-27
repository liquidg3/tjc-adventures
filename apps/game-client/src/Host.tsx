import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { Room } from "colyseus.js";
import { createShipScene, type SceneHandle } from "@tjc/scenes";
import { ROOM_NAME, type LanInfo, type PilotInput } from "@tjc/core";
import { makeClient, serverHttpBase } from "./colyseus";
import { applySavedScene } from "./saved-level-scene";

interface PlayerView {
  id: string;
  role: string;
  device: string;
}

/** The laptop "table" screen: creates a room, shows a join QR, lists the crew. */
export function Host() {
  const [code, setCode] = useState("");
  const [joinUrl, setJoinUrl] = useState("");
  const [players, setPlayers] = useState<PlayerView[]>([]);
  const [error, setError] = useState("");
  const [sceneStatus, setSceneStatus] = useState("Loading saved level…");
  const [activePilot, setActivePilot] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const roomRef = useRef<Room | null>(null);
  const lastInputAtRef = useRef(0);

  useEffect(() => {
    if (!canvasRef.current) return;
    let cancelled = false;
    let scene: SceneHandle;
    try {
      scene = createShipScene(canvasRef.current, {
        baseGroundVisible: false,
        loadProceduralScenery: false,
        stopAtLevelEndHold: true,
      });
    } catch (e) {
      setSceneStatus("3D unavailable on this device");
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    sceneRef.current = scene;
    scene.setPlayerShipVisible(true);
    scene.setScenery({});
    applySavedScene(scene)
      .then(() => {
        if (!cancelled) setSceneStatus("Saved level loaded");
      })
      .catch((e) => {
        if (!cancelled) {
          setSceneStatus("Saved level failed to load");
          setError(e?.message ?? String(e));
        }
      });
    return () => {
      cancelled = true;
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (lastInputAtRef.current === 0) return;
      if (performance.now() - lastInputAtRef.current < 450) return;
      lastInputAtRef.current = 0;
      setActivePilot(false);
      sceneRef.current?.setExternalInput(null);
    }, 100);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const info: LanInfo = await fetch(`${serverHttpBase()}/lan-info`).then((r) => r.json());

        const room = await makeClient().create(ROOM_NAME, {
          role: "host",
          device: "laptop",
        });
        if (cancelled) {
          room.leave();
          return;
        }
        roomRef.current = room;
        setCode(room.roomId);
        setJoinUrl(`http://${info.lanIp}:${info.clientPort}/join?room=${room.roomId}`);
        room.onMessage("pilot-input", (input: PilotInput & { clientId?: string }) => {
          lastInputAtRef.current = performance.now();
          setActivePilot(Math.abs(input.vx) > 0 || Math.abs(input.vz) > 0 || input.boosting);
          sceneRef.current?.setExternalInput(input);
        });

        room.onStateChange((state: any) => {
          const list: PlayerView[] = [];
          state.players.forEach((p: any) =>
            list.push({ id: p.id, role: p.role, device: p.device })
          );
          setPlayers(list);
        });
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    })();

    return () => {
      cancelled = true;
      roomRef.current?.leave();
    };
  }, []);

  const crew = players.filter((p) => p.role !== "host");

  return (
    <div className="host-play">
      <canvas ref={canvasRef} className="game-canvas" />
      <div className="screen host host-overlay">
        <h1>TJC: Family Adventures</h1>
      {error && <p className="error">⚠ {error}</p>}
      {!code && !error && <p>Starting room…</p>}
      {code && (
        <>
          <p className="subtitle">Scan to join on your phone (same WiFi)</p>
          <div className="qr">{joinUrl && <QRCodeSVG value={joinUrl} size={220} />}</div>
          <p className="code">
            ROOM <b>{code}</b>
          </p>
          <p className="hint">{joinUrl}</p>
          <p className={activePilot ? "ok" : "dim"}>
            {activePilot ? "Phone pilot active" : "Scan to steer the ship"}
          </p>
          <p className="hint">{sceneStatus}</p>
          <div className="players">
            <h2>Crew ({crew.length})</h2>
            {crew.length === 0 ? (
              <p className="dim">Waiting for players…</p>
            ) : (
              <ul>
                {crew.map((p) => (
                  <li key={p.id}>
                    🎮 {p.role} <span className="dim">({p.device})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
      </div>
    </div>
  );
}
