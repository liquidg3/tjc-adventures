import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { Room } from "colyseus.js";
import {
  PLAYABLE_ROLES,
  ROOM_NAME,
  isPlayableRole,
  type ClaimRoleResult,
  type GunnerInput,
  type HostState,
  type PilotInput,
  type PlayableRole,
} from "@tjc/core";
import { makeClient } from "./colyseus";
import { createShipScene, type SceneHandle } from "@tjc/scenes";
import { applySavedScene } from "./saved-level-scene";
import { PLAYER_AVATARS, avatarById } from "./player-avatar-data";
import { AvatarSprite } from "./player-avatars";
import { ROLE_BLURBS, ROLE_LABELS, ROLE_STATION_COPY } from "./role-ui";

interface PlayerView {
  id: string;
  role: string;
  device: string;
  name: string;
  avatar: string;
}

/** The phone role lobby and lightweight role station. */
export function Controller() {
  const [status, setStatus] = useState("Connecting…");
  const [connected, setConnected] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [players, setPlayers] = useState<PlayerView[]>([]);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(PLAYER_AVATARS[0].id);
  const [showLobby, setShowLobby] = useState(true);
  const [input, setInput] = useState<PilotInput>({ vx: 0, vz: 0, boosting: false });
  const [gunnerInput, setGunnerInputState] = useState<GunnerInput>({ x: 0.5, y: 0.35, firing: false });
  const roomRef = useRef<Room | null>(null);
  const gunnerCanvasRef = useRef<HTMLCanvasElement>(null);
  const gunnerSceneRef = useRef<SceneHandle | null>(null);
  const [gunnerSceneError, setGunnerSceneError] = useState("");
  const currentPlayer = players.find((player) => player.id === sessionId);
  const claimedRole = isPlayableRole(currentPlayer?.role) ? currentPlayer.role : null;
  const takenByRole = roleOccupants(players);

  useEffect(() => {
    let cancelled = false;
    const roomId = new URLSearchParams(location.search).get("room");

    (async () => {
      try {
        const client = makeClient();
        const room = roomId
          ? await client.joinById(roomId, { role: "unassigned", device: "phone" })
          : await client.joinOrCreate(ROOM_NAME, { role: "unassigned", device: "phone" });
        if (cancelled) {
          room.leave();
          return;
        }
        roomRef.current = room;
        setSessionId(room.sessionId);
        setConnected(true);
        setStatus("Choose your crew card.");
        room.onStateChange((state: any) => setPlayers(mapPlayers(state)));
        setPlayers(mapPlayers(room.state));
        room.onMessage("claim-role-result", (result: ClaimRoleResult) => {
          setStatus(result.message ?? (result.ok ? "Seat claimed." : "Seat claim failed."));
          if (result.ok) setShowLobby(false);
        });
        room.onMessage("host-state", (state: HostState) => {
          gunnerSceneRef.current?.applyReplicaState({
            shipX: state.shipX,
            shipY: state.shipY,
            shipZ: state.shipZ,
            scrollZ: state.scrollZ,
          });
        });
      } catch (e: any) {
        setStatus(`Couldn't join: ${e?.message ?? e}`);
      }
    })();

    return () => {
      cancelled = true;
      roomRef.current?.leave();
    };
  }, []);

  useEffect(() => {
    if (!connected || claimedRole !== "pilot") return;
    sendInput(input);
    const timer = window.setInterval(() => sendInput(input), 80);
    return () => window.clearInterval(timer);
  }, [connected, claimedRole, input]);

  useEffect(() => {
    if (!connected || claimedRole !== "gunner") return;
    sendGunnerInput(gunnerInput);
    gunnerSceneRef.current?.setGunnerInput(gunnerInput);
    const timer = window.setInterval(() => sendGunnerInput(gunnerInput), 50);
    return () => window.clearInterval(timer);
  }, [connected, claimedRole, gunnerInput]);

  // The Gunner station mirrors the host's 3D view: the same scene with the saved
  // Studio settings (camera, lighting, level, ship). The drag-to-fire overlay
  // sits on top and also feeds this local scene, so the gunner sees their own
  // reticle/projectiles matching the shared screen.
  const showGunnerStation = connected && claimedRole === "gunner" && !showLobby;
  useEffect(() => {
    if (!showGunnerStation) return;
    const canvas = gunnerCanvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let scene: SceneHandle;
    try {
      scene = createShipScene(canvas, {
        baseGroundVisible: false,
        loadProceduralScenery: false,
        stopAtLevelEndHold: true,
      });
    } catch (e) {
      setGunnerSceneError(e instanceof Error ? e.message : String(e));
      return;
    }
    gunnerSceneRef.current = scene;
    setGunnerSceneError("");
    scene.setPlayerShipVisible(true);
    scene.setScenery({});
    applySavedScene(scene)
      .then(() => {
        if (!cancelled) scene.setReplicaMode(true);
      })
      .catch((e) => {
        if (!cancelled) setGunnerSceneError(e?.message ?? String(e));
      });
    return () => {
      cancelled = true;
      scene.dispose();
      gunnerSceneRef.current = null;
    };
  }, [showGunnerStation]);

  function sendInput(nextInput: PilotInput) {
    roomRef.current?.send("pilot-input", nextInput);
  }

  function sendGunnerInput(nextInput: GunnerInput) {
    roomRef.current?.send("gunner-input", nextInput);
  }

  function claimRole(role: PlayableRole) {
    const cleanName = name.replace(/\s+/g, " ").trim();
    if (!cleanName) {
      setStatus("Enter your name before choosing a role.");
      return;
    }
    if (takenByRole.get(role) && takenByRole.get(role)?.id !== sessionId) {
      setStatus(`${ROLE_LABELS[role]} is already taken.`);
      return;
    }
    setStatus(`Claiming ${ROLE_LABELS[role]}...`);
    roomRef.current?.send("claim-role", {
      role,
      name: cleanName,
      avatar,
    });
  }

  function press(partial: Partial<PilotInput>) {
    setInput((current) => ({ ...current, ...partial }));
  }

  function release(partial: Partial<PilotInput>) {
    setInput((current) => ({ ...current, ...partial }));
  }

  function stopAll() {
    setInput({ vx: 0, vz: 0, boosting: false });
  }

  function aimGunner(e: PointerEvent<HTMLElement>, firing: boolean) {
    const rect = e.currentTarget.getBoundingClientRect();
    setGunnerInputState({
      x: clamp01((e.clientX - rect.left) / Math.max(1, rect.width)),
      y: clamp01((e.clientY - rect.top) / Math.max(1, rect.height)),
      firing,
    });
  }

  function stopGunnerFire() {
    setGunnerInputState((current) => ({ ...current, firing: false }));
  }

  if (!claimedRole || showLobby) {
    return (
      <div className="screen controller join-lobby">
        <h1>Choose Your Crew Card</h1>
        <p className={connected ? "ok" : "error"}>{status}</p>
        {connected && <p className="dim">{players.length} connected</p>}

        <label className="join-name">
          <span>Name</span>
          <input
            value={name}
            maxLength={18}
            autoComplete="off"
            placeholder="Crew name"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div className="avatar-picker" aria-label="Choose an avatar">
          {PLAYER_AVATARS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`avatar-card${avatar === option.id ? " selected" : ""}`}
              onClick={() => setAvatar(option.id)}
            >
              <AvatarSprite id={option.id} size={5} />
              <span>{option.name}</span>
              <small>{option.blurb}</small>
            </button>
          ))}
        </div>

        <div className="role-picker" aria-label="Choose a role">
          {PLAYABLE_ROLES.map((role) => {
            const occupant = takenByRole.get(role);
            const takenByOther = Boolean(occupant && occupant.id !== sessionId);
            const ownRole = occupant?.id === sessionId;
            return (
              <button
                key={role}
                type="button"
                className={`role-card${takenByOther ? " taken" : ""}${ownRole ? " selected" : ""}`}
                disabled={!connected || takenByOther}
                onClick={() => claimRole(role)}
              >
                <span className="role-title">{ROLE_LABELS[role]}</span>
                <span className="role-copy">{ROLE_BLURBS[role]}</span>
                <span className="role-occupant">
                  {occupant ? (
                    <>
                      <AvatarSprite id={occupant.avatar} size={2} />
                      {ownRole ? "Your seat" : `${displayName(occupant)} has it`}
                    </>
                  ) : (
                    "Available"
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const selectedAvatar = avatarById(currentPlayer?.avatar);

  return (
    <div className="screen controller station-screen">
      <div className="station-id">
        <AvatarSprite id={currentPlayer?.avatar} size={5} />
        <div>
          <h1>{ROLE_LABELS[claimedRole]} Station</h1>
          <p className="dim">
            {displayName(currentPlayer)} · {selectedAvatar.name}
          </p>
        </div>
      </div>
      <p className={connected ? "ok" : "error"}>{status}</p>
      {claimedRole === "pilot" ? (
        <>
          <div className="pilot-pad" onPointerLeave={stopAll}>
            <ControlButton
              label="Up"
              className="pad-up"
              disabled={!connected}
              onDown={() => press({ vz: 1 })}
              onUp={() => release({ vz: 0 })}
            />
            <ControlButton
              label="Left"
              className="pad-left"
              disabled={!connected}
              onDown={() => press({ vx: -1 })}
              onUp={() => release({ vx: 0 })}
            />
            <ControlButton
              label="Right"
              className="pad-right"
              disabled={!connected}
              onDown={() => press({ vx: 1 })}
              onUp={() => release({ vx: 0 })}
            />
            <ControlButton
              label="Down"
              className="pad-down"
              disabled={!connected}
              onDown={() => press({ vz: -1 })}
              onUp={() => release({ vz: 0 })}
            />
          </div>
          <ControlButton
            label="Boost"
            className="boost-button"
            disabled={!connected}
            onDown={() => press({ boosting: true })}
            onUp={() => release({ boosting: false })}
          />
        </>
      ) : claimedRole === "gunner" ? (
        <>
          <div
            className={`gunner-view${gunnerInput.firing ? " firing" : ""}`}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              aimGunner(e, true);
            }}
            onPointerMove={(e) => {
              if (e.buttons > 0) aimGunner(e, true);
            }}
            onPointerUp={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
              aimGunner(e, false);
            }}
            onPointerCancel={stopGunnerFire}
            onLostPointerCapture={stopGunnerFire}
            role="application"
            aria-label="Gunner targeting view"
          >
            <canvas ref={gunnerCanvasRef} className="gunner-canvas" />
            {gunnerSceneError && (
              <div className="gunner-scene-error">3D unavailable: {gunnerSceneError}</div>
            )}
            <div
              className="gunner-crosshair"
              style={{
                left: `${gunnerInput.x * 100}%`,
                top: `${gunnerInput.y * 100}%`,
              }}
            />
            <div className="gunner-fire-label">
              {gunnerInput.firing ? "FIRING" : "HOLD TO FIRE"}
            </div>
          </div>
        </>
      ) : (
        <div className={`station-placeholder ${claimedRole}`}>
          <b>{ROLE_LABELS[claimedRole]} linked</b>
          <span>{ROLE_STATION_COPY[claimedRole]}</span>
        </div>
      )}
      <p className="hint">{ROLE_STATION_COPY[claimedRole]}</p>
      <button className="change-seat" type="button" onClick={() => setShowLobby(true)}>
        Change Seat
      </button>
    </div>
  );
}

function mapPlayers(state: any): PlayerView[] {
  const list: PlayerView[] = [];
  state.players.forEach((player: any) => {
    list.push({
      id: player.id,
      role: player.role,
      device: player.device,
      name: player.name,
      avatar: player.avatar,
    });
  });
  return list;
}

function roleOccupants(players: PlayerView[]) {
  const occupants = new Map<PlayableRole, PlayerView>();
  for (const player of players) {
    if (isPlayableRole(player.role)) occupants.set(player.role, player);
  }
  return occupants;
}

function displayName(player: PlayerView | undefined) {
  if (!player) return "Crewmate";
  return player.name || (player.device === "laptop" ? "Host" : "Crewmate");
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function ControlButton({
  label,
  className,
  disabled,
  onDown,
  onUp,
}: {
  label: string;
  className: string;
  disabled: boolean;
  onDown: () => void;
  onUp: () => void;
}) {
  return (
    <button
      className={className}
      disabled={disabled}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onDown();
      }}
      onPointerUp={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        onUp();
      }}
      onPointerCancel={onUp}
      onLostPointerCapture={onUp}
    >
      {label}
    </button>
  );
}
