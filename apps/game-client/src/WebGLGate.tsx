import { useState, type ReactNode } from "react";

/**
 * Preflight WebGL check. The game renders in 3D via Babylon/WebGL; on devices
 * that can't provide a WebGL context (e.g. a Jetson where Chromium blocklists
 * the GPU) the scene would otherwise crash to a blank screen.
 *
 * When WebGL is available this renders nothing and passes straight through, so
 * phones and normal machines never see it. When it's missing it shows one
 * friendly notice with a "Continue anyway" escape hatch for beta testing.
 */

interface WebGLSupport {
  ok: boolean;
  reason: string;
}

function detectWebGL(): WebGLSupport {
  if (typeof document === "undefined") return { ok: true, reason: "" };
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    if (!gl) {
      return {
        ok: false,
        reason: "This browser/device isn't providing a WebGL context.",
      };
    }
    return { ok: true, reason: "" };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

const DISMISS_KEY = "tjc-webgl-warning-dismissed";

export function WebGLGate({ children }: { children: ReactNode }) {
  const [support] = useState(detectWebGL);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  if (support.ok || dismissed) return <>{children}</>;

  return (
    <main className="webgl-gate">
      <section className="webgl-gate-panel">
        <p className="eyebrow">Heads up</p>
        <h1>3D might not run on this device</h1>
        <p className="subtitle">
          This game draws its world in 3D using WebGL, and right now your browser
          isn't handing us a WebGL context. The game screen will likely be blank
          on this device.
        </p>
        <p className="hint">{support.reason}</p>
        <ul className="webgl-gate-tips">
          <li>📱 Phones joining as controllers don't need 3D — they'll work fine.</li>
          <li>
            💻 On a laptop/desktop, turn on hardware acceleration in your browser
            settings, then reload.
          </li>
        </ul>
        <button
          type="button"
          className="start-button primary"
          onClick={() => {
            try {
              sessionStorage.setItem(DISMISS_KEY, "1");
            } catch {
              /* sessionStorage may be unavailable; dismiss for this view anyway */
            }
            setDismissed(true);
          }}
        >
          Continue anyway (beta)
        </button>
        <p className="hint">You can keep going, but expect the 3D view to be blank.</p>
      </section>
    </main>
  );
}
