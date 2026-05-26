import { DOUBLE_TAP_MS } from "./scene-config";

export interface InputState {
  vx: number;
  vz: number;
  boosting: boolean;
  /** one-shot barrel-roll dodge from a double-tap: -1 left, +1 right, 0 none */
  dodge: number;
}

export interface InputController {
  getState: () => InputState;
  dispose: () => void;
}

export function createInputController(onTogglePixel: () => void): InputController {
  const keys = new Set<string>();
  let pendingDodge = 0; // consumed on the next getState()
  let lastLeftTap = 0;
  let lastRightTap = 0;

  const onKeyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (key.startsWith("arrow")) e.preventDefault();
    // fresh presses only (ignore OS auto-repeat) drive taps + the pixel toggle
    if (!e.repeat) {
      const now = performance.now();
      if (key === "arrowleft" || key === "a") {
        if (now - lastLeftTap < DOUBLE_TAP_MS) pendingDodge = -1;
        lastLeftTap = now;
      } else if (key === "arrowright" || key === "d") {
        if (now - lastRightTap < DOUBLE_TAP_MS) pendingDodge = 1;
        lastRightTap = now;
      }
      if (key === "p") onTogglePixel();
    }
    keys.add(key);
  };

  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.key.toLowerCase());
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  return {
    getState() {
      const left = keys.has("arrowleft") || keys.has("a");
      const right = keys.has("arrowright") || keys.has("d");
      const up = keys.has("arrowup") || keys.has("w");
      const down = keys.has("arrowdown") || keys.has("s");
      const dodge = pendingDodge;
      pendingDodge = 0;
      return {
        vx: (right ? 1 : 0) - (left ? 1 : 0),
        vz: (up ? 1 : 0) - (down ? 1 : 0),
        boosting: keys.has("shift"),
        dodge,
      };
    },
    dispose() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    },
  };
}
