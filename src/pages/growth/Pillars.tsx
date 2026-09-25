import { useEffect, useMemo, useState } from "react";
import { useActiveMember } from "../../growth/hooks/useActiveMember";
import MemberSwitcher from "../../growth/components/MemberSwitcher";
import GrowthSubNav from "../../growth/components/GrowthSubNav";
import ScoreBadge from "../../growth/components/ScoreBadge";
import PillarCard from "../../growth/components/PillarCard";
import TrendChart from "../../growth/components/TrendChart";
import {
  GROWTH_PILLARS,
  TIME_WINDOW_OPTIONS,
  LONG_TERM_GOALS_PLACEHOLDER,
  type PillarKey,
  type TimeWindow,
} from "../../growth/lib/constants";
import {
  average,
  boundsForWindow,
  boundsForMonth,
  previousEqualWindow,
  roundTo,
  trendDirection,
  toDateKey,
  weekStartMonday,
  weeksInRange,
  colorFor,
} from "../../growth/lib/scoring";
import {
  fetchScoredCheckIns,
  deleteCheckIn,
  fetchLongTermGoals,
  saveLongTermGoals,
  type GrowthCheckInScored,
  type GrowthMember,
} from "../../growth/lib/api";
import { useNavigate } from "react-router-dom";
import "./growth.css";

type MemberSeries = {
  member: GrowthMember;
  rows: GrowthCheckInScored[];
  prevRows: GrowthCheckInScored[];
  allRows: GrowthCheckInScored[];
};

export default function Pillars() {
  const { activeSlug, setActiveSlug, activeMember, members, loading: memberLoading, error: memberError } = useActiveMember();
  const [window_, setWindow] = useState<TimeWindow>("this_month");
  const [compareBoth, setCompareBoth] = useState(false);
  const [seriesByMember, setSeriesByMember] = useState<Record<string, MemberSeries>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const membersToLoad = useMemo(() => {
    if (!activeMember) return [];
    if (!compareBoth) return [activeMember];
    return members;
  }, [activeMember, compareBoth, members]);

  useEffect(() => {
    if (membersToLoad.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const { start, end } = boundsForWindow(window_);
        const { start: prevStart, end: prevEnd } = previousEqualWindow(window_);
        const allBounds = boundsForWindow("all_time");

        const next: Record<string, MemberSeries> = {};
        for (const m of membersToLoad) {
          const [rows, prevRows, allRows] = await Promise.all([
            fetchScoredCheckIns(m.id, start, end),
            fetchScoredCheckIns(m.id, prevStart, prevEnd),
            fetchScoredCheckIns(m.id, allBounds.start, allBounds.end),
          ]);
          next[m.id] = { member: m, rows, prevRows, allRows };
        }
        if (!cancelled) setSeriesByMember(next);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Failed to load check-ins");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membersToLoad.map((m) => m.id).join(","), window_, reloadKey]);

  async function handleDeleteWeek(checkInId: string) {
    const confirmed = window.confirm(
      "Delete this week's check-in? This also deletes its goals and cannot be undone."
    );
    if (!confirmed) return;
    try {
      setDeletingId(checkInId);
      await deleteCheckIn(checkInId);
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      setError(e.message || "Failed to delete check-in");
    } finally {
      setDeletingId(null);
    }
  }

  const navigate = useNavigate();
  function handleEditWeek(row: GrowthCheckInScored) {
    const confirmed = window.confirm("Edit this week's check-in?");
    if (!confirmed) return;
    navigate(`/growth/check-in?date=${row.check_in_date}&member=${activeSlug}`);
  }

  const activeSeries = activeMember ? seriesByMember[activeMember.id] : undefined;

  const overall = useMemo(() => {
    if (!activeSeries) return { current: null as number | null, previous: null as number | null };
    const current = average(activeSeries.rows.map((r) => r.overall_score));
    const previous = average(activeSeries.prevRows.map((r) => r.overall_score));
    return { current, previous };
  }, [activeSeries]);

  const trend = trendDirection(overall.current, overall.previous);

  const pillarAverages = useMemo(() => {
    const result: Record<PillarKey, number | null> = {
      physical: null,
      mental: null,
      time_energy: null,
      relationships: null,
      habits: null,
      work_money: null,
    };
    const prevResult: Record<PillarKey, number | null> = { ...result };
    if (!activeSeries) return { current: result, previous: prevResult };
    for (const p of GROWTH_PILLARS) {
      result[p.key] = average(activeSeries.rows.map((r) => r[p.scoreColumn]));
      prevResult[p.key] = average(activeSeries.prevRows.map((r) => r[p.scoreColumn]));
    }
    return { current: result, previous: prevResult };
  }, [activeSeries]);

  const followthroughAvg = useMemo(
    () => (activeSeries ? average(activeSeries.rows.map((r) => r.goal_followthrough)) : null),
    [activeSeries]
  );

  const focusArea = useMemo(() => {
    if (!activeSeries) return null;
    let biggestDrop: { key: PillarKey; label: string; drop: number } | null = null;
    for (const p of GROWTH_PILLARS) {
      const cur = pillarAverages.current[p.key];
      const prev = pillarAverages.previous[p.key];
      if (cur != null && prev != null) {
        const drop = prev - cur;
        if (drop >= 1.5 && (!biggestDrop || drop > biggestDrop.drop)) {
          biggestDrop = { key: p.key, label: p.label, drop: roundTo(drop, 1) };
        }
      }
    }
    if (biggestDrop) {
      return { type: "drop" as const, label: biggestDrop.label, value: biggestDrop.drop };
    }

    let lowest: { key: PillarKey; label: string; avg: number } | null = null;
    for (const p of GROWTH_PILLARS) {
      const avg = pillarAverages.current[p.key];
      if (avg != null && (!lowest || avg < lowest.avg)) {
        lowest = { key: p.key, label: p.label, avg };
      }
    }
    if (lowest) return { type: "low" as const, label: lowest.label, value: roundTo(lowest.avg, 1) };
    return null;
  }, [activeSeries, pillarAverages]);

  const streak = useMemo(() => {
    if (!activeSeries) return 0;
    const weekStarts = new Set(activeSeries.allRows.map((r) => r.week_start));
    let count = 0;
    for (let i = 0; i < 520; i++) {
      const cursor = new Date();
      const monday = new Date(cursor);
      const dow = monday.getDay();
      monday.setDate(monday.getDate() - dow + (dow === 0 ? -6 : 1) - i * 7);
      const key = toDateKey(monday);
      if (weekStarts.has(key)) {
        count++;
      } else if (i === 0) {
        continue; // current week may not be filled out yet; don't break the streak on it
      } else {
        break;
      }
    }
    return count;
  }, [activeSeries]);

  const nextCheckIn = useMemo(() => {
    const today = new Date();
    const thisWeekStart = weekStartMonday(today);
    const submittedThisWeek = activeSeries?.allRows.some((r) => r.week_start === thisWeekStart) ?? false;
    const dow = today.getDay(); // 0 = Sun .. 6 = Sat
    const daysUntilNextMonday = dow === 0 ? 1 : 8 - dow; // Mon=1 -> 7, ... Sun=0 -> 1
    if (submittedThisWeek) {
      return { submitted: true, days: daysUntilNextMonday };
    }
    const daysLeftThisWeek = dow === 0 ? 0 : 7 - dow; // days remaining until this week ends (Sun)
    return { submitted: false, days: daysLeftThisWeek };
  }, [activeSeries]);

  const monthlyRollup = useMemo(() => {
    if (!activeSeries) return [] as { month: string; avg: number | null; rows: GrowthCheckInScored[] }[];
    const byMonth = new Map<string, GrowthCheckInScored[]>();
    for (const r of activeSeries.allRows) {
      const month = r.week_start.slice(0, 7);
      if (!byMonth.has(month)) byMonth.set(month, []);
      byMonth.get(month)!.push(r);
    }
    return Array.from(byMonth.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, rows]) => ({
        month,
        avg: average(rows.map((r) => r.overall_score)),
        rows: [...rows].sort((a, b) => b.week_start.localeCompare(a.week_start)),
      }));
  }, [activeSeries]);

  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  function monthLabel(month: string): string {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, 1).toLocaleDateString(undefined, {
      month: "short",
      year: "numeric",
    });
  }

  const chartSeries = useMemo(() => {
    const out: { label: string; points: { x: string; value: number | null }[]; color: string }[] = [];
    const { start, end } = boundsForWindow(window_);
    const grid = weeksInRange(start, end);
    if (activeSeries) {
      const byWeek = new Map(activeSeries.rows.map((r) => [r.week_start, r.overall_score]));
      out.push({
        label: activeSeries.member.display_name,
        points: grid.map((w) => ({ x: w, value: byWeek.get(w) ?? null })),
        color: "#ff8f2a",
      });
    }
    if (compareBoth) {
      for (const m of members) {
        if (m.id === activeMember?.id) continue;
        const s = seriesByMember[m.id];
        if (!s) continue;
        const byWeek = new Map(s.rows.map((r) => [r.week_start, r.overall_score]));
        out.push({
          label: m.display_name,
          points: grid.map((w) => ({ x: w, value: byWeek.get(w) ?? null })),
          color: "#9d7bff",
        });
      }
    }
    return out;
  }, [activeSeries, compareBoth, members, activeMember, seriesByMember, window_]);

  // --- Item 6: look up one specific past month/year ---
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    const currentYear = new Date().getFullYear();
    years.add(currentYear);
    for (const r of activeSeries?.allRows ?? []) years.add(Number(r.week_start.slice(0, 4)));
    return Array.from(years).sort((a, b) => b - a);
  }, [activeSeries]);
  const [lookupYear, setLookupYear] = useState<number>(new Date().getFullYear());
  const [lookupMonth, setLookupMonth] = useState<number>(new Date().getMonth() + 1);
  const monthLookupRows = useMemo(() => {
    if (!activeSeries) return [];
    const { start, end } = boundsForMonth(lookupYear, lookupMonth);
    const s = toDateKey(start);
    const e = toDateKey(end);
    return activeSeries.allRows.filter((r) => r.week_start >= s && r.week_start <= e);
  }, [activeSeries, lookupYear, lookupMonth]);
  const monthLookupAvg = average(monthLookupRows.map((r) => r.overall_score));

  // --- Item 5: persistent long-term goals box ---
  const [goalsText, setGoalsText] = useState("");
  const [goalsLoaded, setGoalsLoaded] = useState(false);
  const [goalsSaveState, setGoalsSaveState] = useState<"idle" | "saving" | "saved">("idle");
  useEffect(() => {
    if (!activeMember) return;
    let cancelled = false;
    setGoalsLoaded(false);
    fetchLongTermGoals(activeMember.id)
      .then((content) => {
        if (!cancelled) {
          setGoalsText(content);
          setGoalsLoaded(true);
        }
      })
      .catch((e: any) => {
        // Don't let a failed fetch leave the box stuck un-editable — start
        // from a blank box instead so you can still type and save.
        if (!cancelled) {
          setError(e.message || "Failed to load long-term goals");
          setGoalsLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeMember?.id]);
  async function handleSaveGoals() {
    if (!activeMember) return;
    setGoalsSaveState("saving");
    try {
      await saveLongTermGoals(activeMember.id, goalsText);
      setGoalsSaveState("saved");
    } catch (e: any) {
      setError(e.message || "Failed to save goals");
      setGoalsSaveState("idle");
    }
  }

  const sortedPillars = useMemo(() => {
    // Worst-scoring pillars first, so your weakest areas surface at the top.
    return [...GROWTH_PILLARS].sort((a, b) => {
      const av = pillarAverages.current[a.key];
      const bv = pillarAverages.current[b.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return av - bv;
    });
  }, [pillarAverages]);

  return (
    <div className="growthPage">
      <GrowthSubNav />
      <div className="growthHeaderRow">
        <div>
          <h1 className="growthTitle">Pillars</h1>
        </div>
        <MemberSwitcher activeSlug={activeSlug} onChange={setActiveSlug} />
      </div>

      <section className="growthCard growthGoalsBox">
        <h2 className="growthSectionTitle">🎯 Long-term goals</h2>
        <div className="growthMuted">
          Persistent — not part of the weekly check-in, editable anytime, visible to both.
        </div>
        <textarea
          className="growthTextarea growthGoalsTextarea"
          placeholder={LONG_TERM_GOALS_PLACEHOLDER}
          value={goalsText}
          onChange={(e) => {
            setGoalsText(e.target.value);
            setGoalsSaveState("idle");
          }}
        />
        <div className="growthGoalsFooter">
          <button
            type="button"
            className="growthGoalsSaveBtn"
            onClick={handleSaveGoals}
            disabled={goalsSaveState === "saving" || !goalsLoaded}
          >
            {goalsSaveState === "saving" ? "Saving…" : "Save goals"}
          </button>
          {goalsSaveState === "saved" && <span className="growthSavedNote">Saved ✓</span>}
          {!goalsLoaded && <span className="growthMuted">Loading your goals…</span>}
        </div>
      </section>

      <div className="growthControlsRow">
        <select
          className="growthSelect"
          value={window_}
          onChange={(e) => setWindow(e.target.value as TimeWindow)}
        >
          {TIME_WINDOW_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <label className="growthCompareToggle">
          <input
            type="checkbox"
            checked={compareBoth}
            onChange={(e) => setCompareBoth(e.target.checked)}
          />
          Compare both
        </label>
      </div>

      {error && <div className="growthError">{error}</div>}
      {memberError && (
        <div className="growthError">
          Couldn't load Devan/Chad profiles ({memberError}). Have you run the Phase 1 migration
          (supabase/migrations/20250924120000_growth_phase1.sql) in the Supabase SQL editor yet?
        </div>
      )}
      {(memberLoading || loading) && <div className="growthMuted">Loading…</div>}

      <div className="growthCard growthOverallCard">
        <ScoreBadge score={overall.current} size="lg" label="Overall score" />
        <div className="growthTrendInfo">
          <div className={`growthTrendArrow growthTrendArrow-${trend.arrow}`}>
            {trend.arrow === "up" && "▲"}
            {trend.arrow === "down" && "▼"}
            {trend.arrow === "flat" && "→"}
            {trend.arrow === "none" && "—"}
            {trend.delta != null ? ` ${trend.delta > 0 ? "+" : ""}${trend.delta}` : ""}
          </div>
          <div className="growthMuted">vs. previous equal period</div>
        </div>
        <div className="growthStreakCol">
          <div className="growthStreak">🔥 {streak}-week streak</div>
          <div className="growthCountdown">
            {nextCheckIn.submitted
              ? `✓ Submitted · next check-in opens in ${nextCheckIn.days}d`
              : nextCheckIn.days === 0
              ? "Check-in due today"
              : `⏳ ${nextCheckIn.days}d left to submit this week`}
          </div>
        </div>
      </div>

      <div className="growthCard">
        <h2 className="growthSectionTitle">Trend</h2>
        <TrendChart series={chartSeries} width={600} height={160} />
      </div>

      {focusArea && (
        <div className="growthCallout">
          {focusArea.type === "drop"
            ? `Heads up: ${focusArea.label} dropped ${focusArea.value} pts vs. last period — worth a look.`
            : `Focus area: ${focusArea.label} is your lowest-scoring pillar (avg ${focusArea.value}/10).`}
        </div>
      )}

      <div className="growthPillarGrid">
        {sortedPillars.map((p) => (
          <PillarCard
            key={p.key}
            pillar={p}
            avgScore={pillarAverages.current[p.key]}
            prevAvgScore={pillarAverages.previous[p.key]}
            isFocus={focusArea?.label === p.label}
            sparklinePoints={
              activeSeries?.rows.map((r) => ({ x: r.week_start, value: r[p.scoreColumn] })) ?? []
            }
          />
        ))}
        <div className="growthPillarCard">
          <div className="growthPillarCardHead">
            <div>
              <div className="growthPillarLabel">Goal Follow-through</div>
              <div className="growthPillarDesc">How consistently goals from last week were completed.</div>
            </div>
            <ScoreBadge score={followthroughAvg == null ? null : followthroughAvg * 10} size="sm" />
          </div>
          <div className="growthPillarSparkline">
            <TrendChart
              series={[
                {
                  points: activeSeries?.rows.map((r) => ({ x: r.week_start, value: r.goal_followthrough })) ?? [],
                },
              ]}
              width={220}
              height={48}
              sparkline
            />
          </div>
        </div>
      </div>

      <div className="growthCard">
        <h2 className="growthSectionTitle">Monthly rollup</h2>
        <div className="growthMuted">Every month on record — tap one to see that month's weekly check-ins and notes.</div>
        {monthlyRollup.length === 0 ? (
          <div className="growthMuted">No check-ins yet.</div>
        ) : (
          <ul className="growthRollupList">
            {monthlyRollup.map((m) => {
              const isOpen = expandedMonth === m.month;
              return (
                <li key={m.month} className="growthRollupItem">
                  <button
                    type="button"
                    className="growthRollupRow growthRollupRowBtn"
                    onClick={() => setExpandedMonth(isOpen ? null : m.month)}
                  >
                    <span>{monthLabel(m.month)}</span>
                    <span className="growthRollupRowRight">
                      <ScoreBadge score={m.avg} size="sm" />
                      <span className={`growthRollupCaret${isOpen ? " open" : ""}`}>▾</span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="growthMonthDetail">
                      {m.rows.map((r) => (
                        <div key={r.id} className="growthMonthWeek">
                          <div className="growthMonthWeekHead">
                            <span>Week of {r.week_start}</span>
                            <ScoreBadge score={r.overall_score} size="sm" />
                          </div>
                          <div className="growthPillarGrid growthPillarGridCompact">
                            {GROWTH_PILLARS.map((p) => {
                              const val = r[p.scoreColumn];
                              return (
                                <div key={p.key} className="growthMonthPillarChip">
                                  <span className="growthMonthPillarChipLabel">{p.label}</span>
                                  <span style={val != null ? { color: colorFor(val * 10), fontWeight: 800 } : undefined}>
                                    {val ?? "—"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          {(r.pain_note || r.life_reflection) && (
                            <div className="growthMonthNotes">
                              {r.pain_note && (
                                <div>
                                  <strong>Pain note:</strong> {r.pain_note}
                                </div>
                              )}
                              {r.life_reflection && (
                                <div>
                                  <strong>How's life going:</strong> {r.life_reflection}
                                </div>
                              )}
                            </div>
                          )}
                          <div className="growthMonthWeekActions">
                            <button
                              type="button"
                              className="growthBtnEditSm"
                              onClick={() => handleEditWeek(r)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="growthBtnDangerSm"
                              onClick={() => handleDeleteWeek(r.id)}
                              disabled={deletingId === r.id}
                            >
                              {deletingId === r.id ? "Deleting…" : "Delete"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="growthCard">
        <h2 className="growthSectionTitle">Look up a specific month</h2>
        <div className="growthControlsRow">
          <select
            className="growthSelect"
            value={lookupMonth}
            onChange={(e) => setLookupMonth(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {new Date(2000, m - 1, 1).toLocaleDateString(undefined, { month: "long" })}
              </option>
            ))}
          </select>
          <select
            className="growthSelect"
            value={lookupYear}
            onChange={(e) => setLookupYear(Number(e.target.value))}
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        {monthLookupRows.length === 0 ? (
          <div className="growthMuted growthEmptyState">
            No check-in submitted for{" "}
            {new Date(lookupYear, lookupMonth - 1, 1).toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}.
          </div>
        ) : (
          <div className="growthMonthDetail">
            <div className="growthMonthWeekHead">
              <span>
                {new Date(lookupYear, lookupMonth - 1, 1).toLocaleDateString(undefined, {
                  month: "long",
                  year: "numeric",
                })}{" "}
                average
              </span>
              <ScoreBadge score={monthLookupAvg} size="sm" />
            </div>
            {monthLookupRows.map((r) => (
              <div key={r.id} className="growthMonthWeek">
                <div className="growthMonthWeekHead">
                  <span>Week of {r.week_start}</span>
                  <ScoreBadge score={r.overall_score} size="sm" />
                </div>
                <div className="growthPillarGrid growthPillarGridCompact">
                  {GROWTH_PILLARS.map((p) => {
                    const val = r[p.scoreColumn];
                    return (
                      <div key={p.key} className="growthMonthPillarChip">
                        <span className="growthMonthPillarChipLabel">{p.label}</span>
                        <span style={val != null ? { color: colorFor(val * 10), fontWeight: 800 } : undefined}>
                          {val ?? "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {(r.pain_note || r.life_reflection) && (
                  <div className="growthMonthNotes">
                    {r.pain_note && (
                      <div>
                        <strong>Pain note:</strong> {r.pain_note}
                      </div>
                    )}
                    {r.life_reflection && (
                      <div>
                        <strong>How's life going:</strong> {r.life_reflection}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
