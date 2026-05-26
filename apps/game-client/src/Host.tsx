import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { Room } from "colyseus.js";
import { ROOM_NAME, type LanInfo } from "@tjc/core";
import { makeClient, serverHttpBase } from "./colyseus";

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
  const roomRef = useRef<Room | null>(null);

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
    <div className="screen host">
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
  );
}
