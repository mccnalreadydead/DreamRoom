import { useRef } from "react";

export function useDebouncedCallback<T extends (...args: any[]) => void>(
  fn: T,
  delay = 600
) {
  const t = useRef<number | null>(null);

  return (...args: Parameters<T>) => {
    if (t.current) window.clearTimeout(t.current);
    t.current = window.setTimeout(() => fn(...args), delay);
  };
}
