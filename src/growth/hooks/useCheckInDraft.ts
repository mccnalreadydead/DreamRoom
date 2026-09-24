import { useEffect, useRef, useState } from "react";
import { useLocalDraft } from "../../hooks/useLocalDraft";
import { useDebouncedCallback } from "../../hooks/useDebouncedCallback";

/**
 * Autosaved local draft for the Check-In form, keyed per member+week so
 * switching profiles or dates never clobbers another draft. Wraps the
 * existing useLocalDraft/useDebouncedCallback patterns used elsewhere.
 */
export function useCheckInDraft<T>(memberSlug: string, weekStart: string, initial: T) {
  const key = `growth_checkin_draft_${memberSlug}_${weekStart}`;
  const { state, setState, clear } = useLocalDraft<T>(key, initial);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const lastKey = useRef(key);

  // Reset to `initial` whenever the member/week changes (new draft key).
  useEffect(() => {
    if (lastKey.current !== key) {
      lastKey.current = key;
      setState(initial);
      setSavedAt(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const markSaved = useDebouncedCallback(() => setSavedAt(Date.now()), 400);

  function update(patch: Partial<T>) {
    setState((prev) => ({ ...prev, ...patch }));
    markSaved();
  }

  return { draft: state, setDraft: setState, update, clearDraft: clear, savedAt };
}
