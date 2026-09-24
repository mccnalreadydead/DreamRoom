import { useCallback, useEffect, useState } from "react";
import { ACTIVE_MEMBER_STORAGE_KEY, GROWTH_MEMBERS, type MemberSlug } from "../lib/constants";
import { fetchMembers, type GrowthMember } from "../lib/api";

function readStoredSlug(): MemberSlug {
  try {
    const raw = localStorage.getItem(ACTIVE_MEMBER_STORAGE_KEY);
    if (raw === "devan" || raw === "chad") return raw;
  } catch {
    // ignore storage errors
  }
  return GROWTH_MEMBERS[0].slug;
}

/**
 * Shared-device profile switcher (NOT real per-user auth — see
 * GROWTH_PRIVACY in constants.ts). Persists the active slug in
 * localStorage and resolves it to the matching growth_members row.
 */
export function useActiveMember() {
  const [activeSlug, setActiveSlugState] = useState<MemberSlug>(() => readStoredSlug());
  const [members, setMembers] = useState<GrowthMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const rows = await fetchMembers();
        if (!cancelled) setMembers(rows);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Failed to load growth members");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setActiveSlug = useCallback((slug: MemberSlug) => {
    setActiveSlugState(slug);
    try {
      localStorage.setItem(ACTIVE_MEMBER_STORAGE_KEY, slug);
    } catch {
      // ignore storage errors
    }
  }, []);

  const activeMember = members.find((m) => m.slug === activeSlug) ?? null;

  return { activeSlug, setActiveSlug, activeMember, members, loading, error };
}
