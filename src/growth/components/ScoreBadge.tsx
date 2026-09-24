import { colorFor } from "../lib/scoring";

type Props = {
  score: number | null | undefined;
  size?: "sm" | "md" | "lg";
  suffix?: string;
  label?: string;
};

/** Colored pill showing a score (0-100 overall, or 1-10 pillar) with its band color. */
export default function ScoreBadge({ score, size = "md", suffix, label }: Props) {
  const color = colorFor(score);
  const dims =
    size === "lg" ? { w: 76, h: 76, fs: 26 } : size === "sm" ? { w: 36, h: 36, fs: 13 } : { w: 54, h: 54, fs: 18 };

  return (
    <div className="growthScoreBadgeWrap">
      <div
        className="growthScoreBadge"
        style={{
          width: dims.w,
          height: dims.h,
          fontSize: dims.fs,
          borderColor: color,
          boxShadow: `0 0 18px ${color}55`,
        }}
      >
        {score == null ? "—" : Math.round(score)}
        {score != null && suffix ? <span className="growthScoreBadgeSuffix">{suffix}</span> : null}
      </div>
      {label ? <div className="growthScoreBadgeLabel">{label}</div> : null}
    </div>
  );
}
