import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createViewer, type ViewerCameraView, type ViewerHandle, type ShipVariant } from "./viewer-scene";

// The expanded modal's 2×2 grid: top/front/side share defaults; iso spins and
// drops the markers. Driven from a config so the JSX is one `.map`.
interface GridPane {
  label: string;
  view: ViewerCameraView;
  spin?: boolean;
  lockTargetToPivot?: boolean;
  wheelZoomOnly?: boolean;
  showMarkers?: boolean;
}
const GRID_PANES: GridPane[] = [
  { label: "top", view: "top" },
  { label: "front", view: "front" },
  { label: "side", view: "side" },
  {
    label: "iso",
    view: "isometric",
    spin: true,
    lockTargetToPivot: false,
    wheelZoomOnly: false,
    showMarkers: false,
  },
];
import { acquireContext, releaseContext, onContextFreed } from "./viewer-budget";
import {
  getDefaultNormalizationPresets,
  getNormalizationPreset,
  resolveAssetNormalization,
  type AssetNormalization,
  type AssetNormalizationOverride,
  type NormalizationPresetId,
  type NormalizationPresetMap,
} from "./asset-normalization";

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
  normalizationPreset = "none",
  normalizationPresets = getDefaultNormalizationPresets(),
  normalizationOverride,
  normalizationResolved,
  overlayContent,
}: {
  modelUrl?: string;
  variant?: ShipVariant;
  atlasUrl?: string;
  orientX?: number;
  orientY?: number;
  orientZ?: number;
  defaultSpin?: boolean;
  normalizationPreset?: NormalizationPresetId;
  normalizationPresets?: NormalizationPresetMap;
  normalizationOverride?: AssetNormalizationOverride;
  normalizationResolved?: AssetNormalization;
  overlayContent?: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<ViewerHandle | null>(null);
  const [pixelate, setPixelate] = useState(false);
  const [spin, setSpin] = useState(defaultSpin);
  const [status, setStatus] = useState("");
  const [visible, setVisible] = useState(false);
  const [live, setLive] = useState(false); // do we currently hold a context + engine?
  const [expanded, setExpanded] = useState(false);

  // resolve preset + override (or use the caller's draft) once per render — the
  // main preview and every pane in the expanded grid all want the same value
  const resolvedNormalization = useMemo(
    () =>
      normalizationResolved ??
      resolveAssetNormalization(
        getNormalizationPreset(normalizationPresets, normalizationPreset),
        normalizationOverride,
      ),
    [normalizationResolved, normalizationPresets, normalizationPreset, normalizationOverride],
  );

  // Only run engines for cards that are actually on screen.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  // Lease a context slot while visible; wait in line if we're over budget.
  useEffect(() => {
    if (!visible && !expanded) {
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
  }, [expanded, visible]);

  // Spin up / tear down the actual Babylon engine when we hold a lease.
  useEffect(() => {
    if (!live || !canvasRef.current) return;
    const h = createViewer(
      canvasRef.current,
      {
        modelUrl,
        variant,
        atlasUrl,
        pixelate,
        spin,
        spinSpeed: 0.22,
        showPivotMarker: false,
        showForwardMarker: false,
        orient: [orientX, orientY, orientZ],
        normalization: resolvedNormalization,
        lockTargetToPivot: true,
        view: "isometric",
      },
      setStatus,
    );
    handleRef.current = h;
    return () => {
      h.dispose();
      handleRef.current = null;
    };
    // Intentionally omits orient*/pixelate/spin/setStatus — orientation, pixelate
    // and spin are pushed to the running engine via separate effects below
    // (avoiding an engine rebuild on every tweak); setStatus is a stable setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atlasUrl, live, modelUrl, resolvedNormalization, variant]);

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
    <div ref={wrapRef} className={`preview-wrap ${expanded ? "preview-wrap-expanded" : ""}`}>
      {expanded && <button className="preview-backdrop" onClick={() => setExpanded(false)} aria-label="Close preview" />}
      <div className="preview-shell">
        <div className="preview-header">
          <div className="preview-heading">
            <strong>Model Preview</strong>
            <span>Gold arrow = gameplay forward. Pivot = turn/bank center.</span>
          </div>
          <div className="preview-toolbar">
            <button onClick={() => setExpanded((open) => !open)}>{expanded ? "⤢ close" : "⤢ expand"}</button>
          </div>
        </div>
        <div className="preview-body">
          <div className="preview-main">
            {expanded ? (
              <div className="preview-grid">
                {GRID_PANES.map((pane) => (
                  <FixedPreview
                    key={pane.label}
                    {...pane}
                    modelUrl={modelUrl}
                    variant={variant}
                    atlasUrl={atlasUrl}
                    pixelate={pixelate}
                    normalization={resolvedNormalization}
                  />
                ))}
              </div>
            ) : live ? (
              <canvas ref={canvasRef} className="viewer" />
            ) : (
              <div className="viewer viewer-idle">{visible || expanded ? "warming up…" : "scroll to preview"}</div>
            )}
            <div className="card-controls">
              <button onClick={() => setSpin((s) => !s)}>{spin ? "⏸" : "▶"}</button>
              <button className={pixelate ? "on" : ""} onClick={() => setPixelate((p) => !p)}>
                {pixelate ? "▣ pixel" : "▢ pixel"}
              </button>
              <span className="card-status">{status}</span>
            </div>
          </div>
          {expanded && overlayContent && <aside className="preview-sidepanel">{overlayContent}</aside>}
        </div>
      </div>
    </div>
  );
}

function FixedPreview({
  label,
  view,
  modelUrl,
  variant,
  atlasUrl,
  pixelate,
  normalization,
  spin = false,
  lockTargetToPivot = true,
  wheelZoomOnly = true,
  showMarkers = true,
}: {
  label: string;
  view: ViewerCameraView;
  modelUrl?: string;
  variant?: ShipVariant;
  atlasUrl?: string;
  pixelate: boolean;
  normalization: NormalizationPresetMap[NormalizationPresetId];
  spin?: boolean;
  lockTargetToPivot?: boolean;
  wheelZoomOnly?: boolean;
  showMarkers?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<ViewerHandle | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!canvasRef.current) return;
    const handle = createViewer(
      canvasRef.current,
      {
        modelUrl,
        variant,
        atlasUrl,
        pixelate,
        spin,
        spinSpeed: spin ? 0.22 : undefined,
        showPivotMarker: showMarkers,
        showForwardMarker: showMarkers,
        normalization,
        view,
        lockTargetToPivot,
        wheelZoomOnly,
      },
      setStatus,
    );
    handleRef.current = handle;
    return () => {
      handle.dispose();
      handleRef.current = null;
    };
  }, [atlasUrl, lockTargetToPivot, modelUrl, normalization, pixelate, showMarkers, spin, variant, view, wheelZoomOnly]);

  return (
    <div className="fixed-preview">
      <div className="fixed-preview-head">
        <span>{label}</span>
        <span>{status}</span>
      </div>
      <canvas ref={canvasRef} className="fixed-preview-canvas" />
    </div>
  );
}
