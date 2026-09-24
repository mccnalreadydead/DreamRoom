import { GROWTH_MEMBERS, type MemberSlug } from "../lib/constants";

type Props = {
  activeSlug: MemberSlug;
  onChange: (slug: MemberSlug) => void;
};

/** Shared-device Devan/Chad switcher — not real per-user auth. */
export default function MemberSwitcher({ activeSlug, onChange }: Props) {
  return (
    <div className="growthSwitcher" role="tablist" aria-label="Active profile">
      {GROWTH_MEMBERS.map((m) => (
        <button
          key={m.slug}
          type="button"
          role="tab"
          aria-selected={activeSlug === m.slug}
          className={`growthSwitcherBtn${activeSlug === m.slug ? " active" : ""}`}
          onClick={() => onChange(m.slug)}
        >
          {m.displayName}
        </button>
      ))}
    </div>
  );
}
