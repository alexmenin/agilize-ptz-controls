import { useCallback, useEffect, useRef } from "react";

// Keep the stop callback from the moment movement started, even if selection changes.
export function useHeldControl() {
  const held = useRef<(() => void) | null>(null);
  const stop = useCallback(() => {
    const release = held.current;
    held.current = null;
    release?.();
  }, []);
  const hold = useCallback((release: () => void) => {
    held.current = release;
  }, []);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) stop();
    };
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", hidden);
      stop();
    };
  }, [stop]);
  return { hold, stop };
}
