import { useEffect, useState } from "react";

/**
 * Mirror a JSON file served by a Studio dev endpoint (see `jsonFilePlugin` in
 * vite.config.ts): GET on mount, POST on every update, surfaces a `saved` flag
 * so callers can render "✓ / …". `parse` runs on the raw response so each
 * caller can validate + merge defaults.
 */
export function usePersistedJson<T>(
  url: string,
  initial: T,
  parse: (raw: unknown) => T,
) {
  const [value, setValueState] = useState<T>(initial);
  const [saved, setSaved] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        setValueState(parse(data));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    // parse is a stable function reference at each call site — re-fetching on a
    // changed identity would cause a stale-write race against in-flight saves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const setValue = (next: T) => {
    setValueState(next);
    setSaved(false);
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next, null, 2),
    })
      .then(() => setSaved(true))
      .catch(() => setSaved(false));
  };

  return { value, setValue, saved, loaded };
}
