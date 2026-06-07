import { useEffect, useRef, useState, type SetStateAction } from "react";

const SAVE_DEBOUNCE_MS = 250;

/**
 * Mirror a JSON file served by a Studio dev endpoint (see `jsonFilePlugin` in
 * vite.config.ts): GET on mount, debounced POST after updates, surfaces a `saved`
 * flag so callers can render "✓ / …". `parse` runs on the raw response so each
 * caller can validate + merge defaults. `setValue` accepts React-style updater
 * functions so rapid editor gestures can derive each write from the latest value.
 */
export function usePersistedJson<T>(
  url: string,
  initial: T,
  parse: (raw: unknown) => T,
) {
  const [value, setValueState] = useState<T>(initial);
  const valueRef = useRef(value);
  const saveTimerRef = useRef<number | null>(null);
  const saveSeqRef = useRef(0);
  const [saved, setSaved] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        const next = parse(data);
        valueRef.current = next;
        setValueState(next);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    // parse is a stable function reference at each call site — re-fetching on a
    // changed identity would cause a stale-write race against in-flight saves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => () => {
    if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current);
  }, []);

  const setValue = (nextValue: SetStateAction<T>) => {
    const prev = valueRef.current;
    const next = typeof nextValue === "function"
      ? (nextValue as (prev: T) => T)(prev)
      : nextValue;
    if (Object.is(next, prev)) return;
    valueRef.current = next;
    setValueState(next);
    setSaved(false);
    if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current);
    const saveSeq = ++saveSeqRef.current;
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(valueRef.current, null, 2),
      })
        .then(() => {
          if (saveSeq === saveSeqRef.current) setSaved(true);
        })
        .catch(() => {
          if (saveSeq === saveSeqRef.current) setSaved(false);
        });
    }, SAVE_DEBOUNCE_MS);
  };

  return { value, setValue, saved, loaded };
}
