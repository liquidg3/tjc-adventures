export interface InputState {
  vx: number;
  vz: number;
  boosting: boolean;
}

export interface InputController {
  getState: () => InputState;
  dispose: () => void;
}

export function createInputController(
  onTogglePixel: () => void
): InputController {
  const keys = new Set<string>();

  const onKeyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    keys.add(key);
    if (key.startsWith("arrow")) e.preventDefault();
    if (key === "p") onTogglePixel();
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
      return {
        vx: (right ? 1 : 0) - (left ? 1 : 0),
        vz: (up ? 1 : 0) - (down ? 1 : 0),
        boosting: keys.has("shift"),
      };
    },
    dispose() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    },
  };
}
