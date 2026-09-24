import type { PillarDef } from "../lib/constants";
import { trendDirection } from "../lib/scoring";
import ScoreBadge from "./ScoreBadge";
import TrendChart, { type TrendPoint } from "./TrendChart";

type Props = {
  pillar: PillarDef;
  avgScore: number | null; // 1-10 average for the selected window
  prevAvgScore?: number | null; // 1-10 average for the previous equal window
  sparklinePoints: TrendPoint[]; // weekly 1-10 values, scaled x10 by caller for color bands
};

export default function PillarCard({ pillar, avgScore, prevAvgScore = null, sparklinePoints }: Props) {
  const scaledAvg = avgScore == null ? null : avgScore * 10;
  const trend = trendDirection(avgScore, prevAvgScore);

  return (
    <div className="growthPillarCard">
      <div className="growthPillarCardHead">
        <div>
          <div className="growthPillarLabel">{pillar.label}</div>
          <div className="growthPillarDesc">{pillar.description}</div>
        </div>
        <div className="growthPillarCardScoreCol">
          <ScoreBadge score={scaledAvg} size="sm" />
          <div className={`growthTrendArrow growthTrendArrow-${trend.arrow} growthTrendArrowSm`}>
            {trend.arrow === "up" && "▲"}
            {trend.arrow === "down" && "▼"}
            {trend.arrow === "flat" && "→"}
            {trend.arrow === "none" && ""}
          </div>
        </div>
      </div>
      <div className="growthPillarSparkline">
        <TrendChart
          series={[{ points: sparklinePoints }]}
          width={220}
          height={48}
          sparkline
        />
      </div>
    </div>
  );
}
