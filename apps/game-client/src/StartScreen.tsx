import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { LanInfo } from "@tjc/core";
import { serverHttpBase } from "./colyseus";

export function StartScreen() {
  const [lanUrl, setLanUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`${serverHttpBase()}/lan-info`)
      .then((r) => (r.ok ? r.json() : null))
      .then((info: LanInfo | null) => {
        if (!cancelled && info) setLanUrl(`http://${info.lanIp}:${info.clientPort}`);
      })
      .catch(() => {
        if (!cancelled) setLanUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="start-screen">
      <section className="start-panel">
        <p className="eyebrow">TJC Family Adventures</p>
        <h1>Start Play</h1>
        <p className="subtitle">
          Use the laptop as the shared screen, then have phones join from the same WiFi.
        </p>

        <div className="start-actions">
          <Link className="start-button primary" to="/host">
            Host shared game
          </Link>
          <Link className="start-button" to="/join">
            Join on this device
          </Link>
          <Link className="start-button quiet" to="/game">
            Solo play
          </Link>
        </div>

        <div className="start-notes">
          <p>
            Laptop: open <b>/host</b>, then scan the QR with each phone.
          </p>
          <p>
            Phone fallback: open <b>{lanUrl || "this laptop's WiFi URL"}</b> and tap Join.
          </p>
        </div>
      </section>
    </main>
  );
}
