import { colorFor } from "../lib/scoring";

export type TrendPoint = { x: string; value: number | null };

type Series = {
  points: TrendPoint[];
  color?: string; // line color; dots always use score color band
  label?: string;
};

type Props = {
  series: Series[];
  width?: number;
  height?: number;
  minY?: number;
  maxY?: number;
  showDots?: boolean;
  sparkline?: boolean; // compact: no axis labels, thinner line
};

/** Hand-rolled inline SVG line chart — no charting library dependency. */
export default function TrendChart({
  series,
  width = 320,
  height = 120,
  minY = 0,
  maxY = 100,
  showDots = true,
  sparkline = false,
}: Props) {
  const padX = sparkline ? 4 : 28;
  const padY = sparkline ? 4 : 18;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const allPoints = series.flatMap((s) => s.points);
  if (allPoints.length === 0) {
    return (
      <div className="growthChartEmpty" style={{ width, height }}>
        Not enough data yet
      </div>
    );
  }

  function xFor(i: number, count: number) {
    if (count <= 1) return padX + innerW / 2;
    return padX + (innerW * i) / (count - 1);
  }

  function yFor(v: number) {
    const clamped = Math.max(minY, Math.min(maxY, v));
    const pct = (clamped - minY) / (maxY - minY || 1);
    return padY + innerH * (1 - pct);
  }

  const defaultColors = ["#ff8f2a", "#9d7bff"];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="growthChartSvg"
      role="img"
      aria-label="Score trend chart"
    >
      {!sparkline && (
        <>
          <line x1={padX} y1={padY} x2={padX} y2={height - padY} stroke="rgba(255,255,255,0.12)" />
          <line
            x1={padX}
            y1={height - padY}
            x2={width - padX}
            y2={height - padY}
            stroke="rgba(255,255,255,0.12)"
          />
        </>
      )}

      {series.map((s, si) => {
        const color = s.color ?? defaultColors[si % defaultColors.length];
        const withValues = s.points
          .map((p, i) => ({ ...p, i }))
          .filter((p) => p.value != null) as (TrendPoint & { i: number })[];

        if (withValues.length === 0) return null;

        const path = withValues
          .map((p, idx) => {
            const x = xFor(p.i, s.points.length);
            const y = yFor(p.value as number);
            return `${idx === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ");

        return (
          <g key={si}>
            <path d={path} fill="none" stroke={color} strokeWidth={sparkline ? 1.5 : 2.5} />
            {showDots &&
              withValues.map((p) => (
                <circle
                  key={p.i}
                  cx={xFor(p.i, s.points.length)}
                  cy={yFor(p.value as number)}
                  r={sparkline ? 2 : 4}
                  fill={colorFor(p.value)}
                  stroke="rgba(0,0,0,0.4)"
                  strokeWidth={0.5}
                />
              ))}
          </g>
        );
      })}
    </svg>
  );
}
