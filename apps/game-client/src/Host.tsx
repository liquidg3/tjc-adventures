import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { Room } from "colyseus.js";
import { createShipScene, type SceneHandle } from "@tjc/scenes";
import {
  PLAYABLE_ROLES,
  ROOM_NAME,
  type GunnerInput,
  type LanInfo,
  type PilotInput,
  type PlayableRole,
} from "@tjc/core";
import { makeClient, serverHttpBase } from "./colyseus";
import { applySavedScene } from "./saved-level-scene";
import { AvatarSprite } from "./player-avatars";
import { ROLE_BLURBS, ROLE_LABELS } from "./role-ui";

interface PlayerView {
  id: string;
  role: string;
  device: string;
  name: string;
  avatar: string;
}

/** The laptop "table" screen: creates a room, shows a join QR, lists the crew. */
export function Host() {
  const [code, setCode] = useState("");
  const [joinUrl, setJoinUrl] = useState("");
  const [players, setPlayers] = useState<PlayerView[]>([]);
  const [error, setError] = useState("");
  const [sceneStatus, setSceneStatus] = useState("Loading saved level…");
  const [activePilot, setActivePilot] = useState(false);
  const [activeGunner, setActiveGunner] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const roomRef = useRef<Room | null>(null);
  const lastInputAtRef = useRef(0);
  const lastGunnerInputAtRef = useRef(0);

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
      const now = performance.now();
      if (lastInputAtRef.current > 0 && now - lastInputAtRef.current >= 450) {
        lastInputAtRef.current = 0;
        setActivePilot(false);
        sceneRef.current?.setExternalInput(null);
      }
      if (lastGunnerInputAtRef.current > 0 && now - lastGunnerInputAtRef.current >= 250) {
        lastGunnerInputAtRef.current = 0;
        setActiveGunner(false);
        sceneRef.current?.setGunnerInput(null);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const info: LanInfo = await fetch(`${serverHttpBase()}/lan-info`).then((r) => r.json());

        const room = await makeClient().create(ROOM_NAME, {
          role: "pilot",
          device: "laptop",
          name: "Host",
          avatar: "comet-cadet",
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
        room.onMessage("gunner-input", (input: GunnerInput & { clientId?: string }) => {
          lastGunnerInputAtRef.current = performance.now();
          setActiveGunner(input.firing === true);
          sceneRef.current?.setGunnerInput(input);
        });

        room.onStateChange((state: any) => {
          const list: PlayerView[] = [];
          state.players.forEach((p: any) =>
            list.push({
              id: p.id,
              role: p.role,
              device: p.device,
              name: p.name,
              avatar: p.avatar,
            })
          );
          setPlayers(list);
        });
        setPlayers(mapPlayers(room.state));
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    })();

    return () => {
      cancelled = true;
      roomRef.current?.leave();
    };
  }, []);

  // Broadcast the authoritative ship + scroll state at ~20Hz so replica views
  // (Gunner phones) render exactly what this shared table screen shows.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const scene = sceneRef.current;
      const room = roomRef.current;
      if (!scene || !room) return;
      const pos = scene.getShipPosition();
      if (!pos) return;
      room.send("host-state", {
        shipX: pos.x,
        shipY: pos.y,
        shipZ: pos.z,
        scrollZ: scene.getLevelScrollZ(),
      });
    }, 50);
    return () => window.clearInterval(timer);
  }, []);

  const seats = PLAYABLE_ROLES.map((role) => ({
    role,
    player: players.find((player) => player.role === role),
  }));

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
            {activePilot ? "Remote Pilot active" : "Host is Pilot"}
          </p>
          <p className={activeGunner ? "ok" : "dim"}>
            {activeGunner ? "Gunner targeting" : "Gunner standing by"}
          </p>
          <p className="hint">{sceneStatus}</p>
          <div className="seat-board">
            <h2>Crew Seats</h2>
            {seats.map(({ role, player }) => (
              <SeatCard key={role} role={role} player={player} />
            ))}
          </div>
        </>
      )}
      </div>
    </div>
  );
}

function SeatCard({ role, player }: { role: PlayableRole; player?: PlayerView }) {
  return (
    <div className={`seat-card ${player ? "filled" : "empty"}`}>
      {player ? (
        <AvatarSprite id={player.avatar} size={3} />
      ) : (
        <div className="seat-empty-mark" aria-hidden="true" />
      )}
      <div>
        <b>{ROLE_LABELS[role]}</b>
        <span>{player ? displayName(player) : "Open seat"}</span>
        <small>{player ? player.device : ROLE_BLURBS[role]}</small>
      </div>
    </div>
  );
}

function mapPlayers(state: any): PlayerView[] {
  const list: PlayerView[] = [];
  state.players.forEach((p: any) =>
    list.push({
      id: p.id,
      role: p.role,
      device: p.device,
      name: p.name,
      avatar: p.avatar,
    })
  );
  return list;
}

function displayName(player: PlayerView) {
  return player.name || (player.device === "laptop" ? "Host" : "Crewmate");
}
