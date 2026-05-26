import { useEffect, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import { ROOM_NAME } from "@tjc/core";
import { makeClient } from "./colyseus";

/** The phone control station. M0: join the room, confirm connection, and prove
 *  rapid-tap input flows to the server (the seed of COOL IT DOWN! / SAVE). */
export function Controller() {
  const [status, setStatus] = useState("Connecting…");
  const [connected, setConnected] = useState(false);
  const [crewCount, setCrewCount] = useState(0);
  const [taps, setTaps] = useState(0);
  const roomRef = useRef<Room | null>(null);

  useEffect(() => {
    let cancelled = false;
    const roomId = new URLSearchParams(location.search).get("room");

    (async () => {
      try {
        const client = makeClient();
        const room = roomId
          ? await client.joinById(roomId, { role: "spotter", device: "phone" })
          : await client.joinOrCreate(ROOM_NAME, { role: "spotter", device: "phone" });
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

  const tap = () => {
    setTaps((t) => t + 1);
    roomRef.current?.send("ping");
  };

  return (
    <div className="screen controller">
      <h1>Spotter station</h1>
      <p className={connected ? "ok" : "error"}>{status}</p>
      {connected && <p className="dim">{crewCount} connected</p>}
      <button className="bigtap" onClick={tap} disabled={!connected}>
        TAP!<br />({taps})
      </button>
      <p className="hint">M0 spine — a real tag / cool / patch station comes next.</p>
    </div>
  );
}
