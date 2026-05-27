import { useEffect, useRef, useState } from "react";
import { createViewer, type ViewerHandle, type ShipVariant } from "./viewer-scene";
import { acquireContext, releaseContext, onContextFreed } from "./viewer-budget";

/** Canvas-only orbit preview of one model (a GLB url or a built-in variant),
 *  with pixelate + spin toggles. Reused by every slot card.
 *
 *  Each preview owns a WebGL context, and browsers cap those at ~16 per page, so
 *  we only run an engine while the card is on screen AND holds a context lease
 *  (see viewer-budget). Off-screen / over-budget cards show a cheap placeholder. */
export function ModelPreview({
  modelUrl,
  variant,
  atlasUrl,
  orientX = 0,
  orientY = 0,
  orientZ = 0,
  defaultSpin = true,
}: {
  modelUrl?: string;
  variant?: ShipVariant;
  atlasUrl?: string;
  orientX?: number;
  orientY?: number;
  orientZ?: number;
  defaultSpin?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<ViewerHandle | null>(null);
  const [pixelate, setPixelate] = useState(false);
  const [spin, setSpin] = useState(defaultSpin);
  const [status, setStatus] = useState("");
  const [visible, setVisible] = useState(false);
  const [live, setLive] = useState(false); // do we currently hold a context + engine?

  // Only run engines for cards that are actually on screen.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Lease a context slot while visible; wait in line if we're over budget.
  useEffect(() => {
    if (!visible) {
      setLive(false);
      return;
    }
    let leased = false;
    let cancelWait: (() => void) | undefined;
    const tryAcquire = () => {
      if (acquireContext()) {
        leased = true;
        setLive(true);
      } else {
        cancelWait = onContextFreed(tryAcquire);
      }
    };
    tryAcquire();
    return () => {
      cancelWait?.();
      if (leased) releaseContext();
      setLive(false);
    };
  }, [visible]);

  // Spin up / tear down the actual Babylon engine when we hold a lease.
  useEffect(() => {
    if (!live || !canvasRef.current) return;
    const h = createViewer(
      canvasRef.current,
      { modelUrl, variant, atlasUrl, pixelate, spin, orient: [orientX, orientY, orientZ] },
      setStatus,
    );
    handleRef.current = h;
    return () => {
      h.dispose();
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, modelUrl, variant, atlasUrl]);

  // live-update orientation from the sliders (no engine rebuild)
  useEffect(() => {
    handleRef.current?.setOrient(orientX, orientY, orientZ);
  }, [orientX, orientY, orientZ]);

  useEffect(() => {
    handleRef.current?.setPixelate(pixelate);
  }, [pixelate]);
  useEffect(() => {
    handleRef.current?.setSpin(spin);
  }, [spin]);

  return (
    <div ref={wrapRef} className="preview-wrap">
      {live ? (
        <canvas ref={canvasRef} className="viewer" />
      ) : (
        <div className="viewer viewer-idle">{visible ? "warming up…" : "scroll to preview"}</div>
      )}
      <div className="card-controls">
        <button onClick={() => setSpin((s) => !s)}>{spin ? "⏸" : "▶"}</button>
        <button className={pixelate ? "on" : ""} onClick={() => setPixelate((p) => !p)}>
          {pixelate ? "▣ pixel" : "▢ pixel"}
        </button>
        <span className="card-status">{status}</span>
      </div>
    </div>
  );
}
