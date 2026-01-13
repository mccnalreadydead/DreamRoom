import { useEffect, useState } from "react";

export function useLocalDraft<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // ignore storage errors
    }
  }, [key, state]);

  function clear() {
    try {
      localStorage.removeItem(key);
    } catch {}
  }

  return { state, setState, clear };
}
