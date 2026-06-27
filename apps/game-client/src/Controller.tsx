import { useEffect, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import { ROOM_NAME, type PilotInput } from "@tjc/core";
import { makeClient } from "./colyseus";

/** The phone control station. M0: join the room, confirm connection, and prove
 *  rapid-tap input flows to the server (the seed of COOL IT DOWN! / SAVE). */
export function Controller() {
  const [status, setStatus] = useState("Connecting…");
  const [connected, setConnected] = useState(false);
  const [crewCount, setCrewCount] = useState(0);
  const [input, setInput] = useState<PilotInput>({ vx: 0, vz: 0, boosting: false });
  const roomRef = useRef<Room | null>(null);

  useEffect(() => {
    let cancelled = false;
    const roomId = new URLSearchParams(location.search).get("room");

    (async () => {
      try {
        const client = makeClient();
        const room = roomId
          ? await client.joinById(roomId, { role: "pilot", device: "phone" })
          : await client.joinOrCreate(ROOM_NAME, { role: "pilot", device: "phone" });
        if (cancelled) {
          room.leave();
          return;
        }
        roomRef.current = room;
        setConnected(true);
        setStatus("Connected!");
        room.onStateChange((state: any) => setCrewCount(state.players.size));
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
    if (!connected) return;
    sendInput(input);
    const timer = window.setInterval(() => sendInput(input), 80);
    return () => window.clearInterval(timer);
  }, [connected, input]);

  function sendInput(nextInput: PilotInput) {
    roomRef.current?.send("pilot-input", nextInput);
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

  return (
    <div className="screen controller">
      <h1>Pilot station</h1>
      <p className={connected ? "ok" : "error"}>{status}</p>
      {connected && <p className="dim">{crewCount} connected</p>}
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
      <p className="hint">Hold buttons to fly the ship on the big screen.</p>
    </div>
  );
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
