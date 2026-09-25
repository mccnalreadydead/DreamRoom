import { useEffect, useMemo, useState } from "react";
import { useActiveMember } from "../../growth/hooks/useActiveMember";
import { useCheckInDraft } from "../../growth/hooks/useCheckInDraft";
import MemberSwitcher from "../../growth/components/MemberSwitcher";
import GrowthSubNav from "../../growth/components/GrowthSubNav";
import ScoreBadge from "../../growth/components/ScoreBadge";
import {
  GROWTH_PILLARS,
  MAX_GOALS_PER_CHECK_IN,
  MAX_TASKS_PER_CHECK_IN,
  MAX_HABITS_PER_CHECK_IN,
  PROUD_OF_MAX_LEN,
  PILLAR_ANCHOR_TEXT,
  FOLLOWTHROUGH_ANCHOR_TEXT,
} from "../../growth/lib/constants";
import { toDateKey, weekStartMonday, colorFor, weekDates, DAY_NAMES } from "../../growth/lib/scoring";
import {
  deleteCheckIn,
  ensureHabitsForCheckIn,
  fetchCheckInForWeek,
  fetchGoalsForCheckIn,
  fetchHabitLogs,
  fetchHabitsForCheckIn,
  fetchPriorCheckIn,
  fetchScoredCheckInById,
  fetchWeeklyTasks,
  markGoalCompleted,
  replaceGoals,
  replaceWeeklyTasks,
  upsertCheckIn,
  type GrowthCheckInScored,
  type GrowthGoal,
  type GrowthHabit,
} from "../../growth/lib/api";
import { useSearchParams } from "react-router-dom";
import "./growth.css";

// Pillar scores + proud_of are the only things kept forever (see
// constants.ts). Every other text field below (per-pillar notes,
// adjustments) is part of the in-the-moment reflection process only and
// is intentionally NEVER sent to the database.
type Draft = {
  scorePhysical: number | null;
  scoreMental: number | null;
  scoreTimeEnergy: number | null;
  scoreRelationships: number | null;
  scoreHabits: number | null;
  scoreWorkMoney: number | null;
  noteMental: string; // ephemeral
  noteTimeEnergy: string; // ephemeral
  noteRelationships: string; // ephemeral
  noteWorkMoney: string; // ephemeral
  goalFollowthrough: number | null;
  proudOf: string; // persisted, optional, doesn't affect score
  goals: string[];
  tasks: string[]; // "small tasks this week" — persisted, shown on Home
  habits: string[]; // exactly 2 slots, persisted, tracked daily on Home
  adjustments: string; // ephemeral
};

const EMPTY_DRAFT: Draft = {
  scorePhysical: null,
  scoreMental: null,
  scoreTimeEnergy: null,
  scoreRelationships: null,
  scoreHabits: null,
  scoreWorkMoney: null,
  noteMental: "",
  noteTimeEnergy: "",
  noteRelationships: "",
  noteWorkMoney: "",
  goalFollowthrough: null,
  proudOf: "",
  goals: ["", "", "", "", ""],
  tasks: ["", "", "", "", ""],
  habits: Array(MAX_HABITS_PER_CHECK_IN).fill(""),
  adjustments: "",
};

const EPHEMERAL_NOTE_KEY: Record<string, keyof Draft> = {
  mental: "noteMental",
  time_energy: "noteTimeEnergy",
  relationships: "noteRelationships",
  work_money: "noteWorkMoney",
};
const SCORE_KEY: Record<string, keyof Draft> = {
  physical: "scorePhysical",
  mental: "scoreMental",
  time_energy: "scoreTimeEnergy",
  relationships: "scoreRelationships",
  habits: "scoreHabits",
  work_money: "scoreWorkMoney",
};

export default function CheckIn() {
  const [searchParams] = useSearchParams();
  const { activeSlug, setActiveSlug, activeMember, loading: memberLoading, error: memberError } = useActiveMember();
  const [checkInDate, setCheckInDate] = useState<string>(
    () => searchParams.get("date") || toDateKey(new Date())
  );
  const weekStart = useMemo(() => weekStartMonday(new Date(checkInDate + "T00:00:00")), [checkInDate]);

  // Deep-linked edit (from Pillars → Edit): jump to that member/week once on mount.
  useEffect(() => {
    const memberParam = searchParams.get("member");
    if (memberParam === "devan" || memberParam === "chad") {
      setActiveSlug(memberParam);
    }
    const dateParam = searchParams.get("date");
    if (dateParam) setCheckInDate(dateParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { draft, update, setDraft, savedAt } = useCheckInDraft<Draft>(activeSlug, weekStart, EMPTY_DRAFT);

  // Goals/tasks start collapsed to 2 visible slots each, with a "+ Add
  // another" button to reveal more (up to MAX_GOALS/TASKS_PER_CHECK_IN).
  const [visibleGoals, setVisibleGoals] = useState(2);
  const [visibleTasks, setVisibleTasks] = useState(2);

  const [existingId, setExistingId] = useState<string | null>(null);
  const [priorGoals, setPriorGoals] = useState<GrowthGoal[]>([]);
  const [goalDone, setGoalDone] = useState<Record<string, boolean>>({});
  const [loadingCheckIn, setLoadingCheckIn] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Last week's 3 habits with their day-by-day on/off breakdown, shown
  // above this week's Habits score input.
  const [priorHabits, setPriorHabits] = useState<
    { habit_text: string; days: (("on" | "off") | null)[]; onCount: number; offCount: number }[]
  >([]);
  // This week's own habits, once set (locked in — see ensureHabitsForCheckIn).
  const [thisWeekHabits, setThisWeekHabits] = useState<GrowthHabit[]>([]);

  // Once a week is submitted we show a read-only summary instead of the form.
  // "Edit" flips this back to false and re-populates the form from the record.
  const [summary, setSummary] = useState<GrowthCheckInScored | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Load existing check-in for this member+week (summary mode instead of duplicating),
  // and last week's goals for the follow-through question.
  useEffect(() => {
    if (!activeMember) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingCheckIn(true);
        setError(null);
        const existing = await fetchCheckInForWeek(activeMember.id, weekStart);
        const prior = await fetchPriorCheckIn(activeMember.id, weekStart);
        const priorGoalsRows = prior ? await fetchGoalsForCheckIn(prior.id) : [];
        if (cancelled) return;

        setPriorGoals(priorGoalsRows);
        setGoalDone(Object.fromEntries(priorGoalsRows.map((g) => [g.id, g.completed ?? false])));

        if (prior) {
          const priorHabitRows = await fetchHabitsForCheckIn(prior.id);
          const logs = await fetchHabitLogs(priorHabitRows.map((h) => h.id));
          const dates = weekDates(prior.week_start);
          if (!cancelled) {
            setPriorHabits(
              priorHabitRows.map((h) => {
                const days = dates.map((d) => {
                  const log = logs.find((l) => l.habit_id === h.id && l.log_date === d);
                  return (log?.status as "on" | "off" | undefined) ?? null;
                });
                return {
                  habit_text: h.habit_text,
                  days,
                  onCount: days.filter((s) => s === "on").length,
                  offCount: days.filter((s) => s === "off").length,
                };
              })
            );
          }
        } else if (!cancelled) {
          setPriorHabits([]);
        }

        if (existing) {
          setExistingId(existing.id);
          const scored = await fetchScoredCheckInById(existing.id);
          const habitRows = await fetchHabitsForCheckIn(existing.id);
          if (!cancelled) {
            setSummary(scored);
            setThisWeekHabits(habitRows);
            setShowForm(false);
          }
        } else {
          setExistingId(null);
          setSummary(null);
          setThisWeekHabits([]);
          setShowForm(true);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Failed to load check-in");
      } finally {
        if (!cancelled) setLoadingCheckIn(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMember?.id, weekStart]);

  const hasPriorGoals = priorGoals.length > 0;

  const totalFields = GROWTH_PILLARS.length + (hasPriorGoals ? 1 : 0);
  const filledFields =
    GROWTH_PILLARS.filter((p) => draft[SCORE_KEY[p.key]] != null).length +
    (hasPriorGoals && draft.goalFollowthrough != null ? 1 : 0);
  const progressPct = Math.round((filledFields / totalFields) * 100);

  async function handleSave() {
    if (!activeMember) return;
    try {
      setSaveState("saving");
      setError(null);
      const saved = await upsertCheckIn({
        id: existingId ?? undefined,
        member_id: activeMember.id,
        week_start: weekStart,
        check_in_date: checkInDate,
        score_physical: draft.scorePhysical,
        score_mental: draft.scoreMental,
        score_time_energy: draft.scoreTimeEnergy,
        score_relationships: draft.scoreRelationships,
        score_habits: draft.scoreHabits,
        score_work_money: draft.scoreWorkMoney,
        goal_followthrough: hasPriorGoals ? draft.goalFollowthrough : null,
        proud_of: draft.proudOf.slice(0, PROUD_OF_MAX_LEN) || null,
      });
      await replaceGoals(
        saved.id,
        activeMember.id,
        draft.goals.map((text, i) => ({ goal_text: text, sort_order: i }))
      );
      await replaceWeeklyTasks(
        saved.id,
        activeMember.id,
        draft.tasks.map((text, i) => ({ task_text: text, sort_order: i }))
      );
      await ensureHabitsForCheckIn(saved.id, activeMember.id, draft.habits);
      setExistingId(saved.id);
      const scored = await fetchScoredCheckInById(saved.id);
      const habitRows = await fetchHabitsForCheckIn(saved.id);
      setSummary(scored);
      setThisWeekHabits(habitRows);
      setShowForm(false);
      setDraft(EMPTY_DRAFT); // fully reset the form now that it's submitted
      setVisibleGoals(2);
      setVisibleTasks(2);
      setSaveState("idle");
    } catch (e: any) {
      setError(e.message || "Failed to save check-in");
      setSaveState("error");
    }
  }

  function handleEditFromSummary() {
    if (!summary) return;
    const confirmed = window.confirm("Edit this week's check-in?");
    if (!confirmed) return;
    setDraft({
      ...EMPTY_DRAFT,
      scorePhysical: summary.score_physical,
      scoreMental: summary.score_mental,
      scoreTimeEnergy: summary.score_time_energy,
      scoreRelationships: summary.score_relationships,
      scoreHabits: summary.score_habits,
      scoreWorkMoney: summary.score_work_money,
      goalFollowthrough: summary.goal_followthrough,
      proudOf: summary.proud_of ?? "",
    });
    setVisibleGoals(2);
    setVisibleTasks(2);
    (async () => {
      if (existingId) {
        const rows = await fetchGoalsForCheckIn(existingId);
        if (rows.length > 0) {
          const goals = ["", "", "", "", ""];
          rows.forEach((g, i) => {
            if (i < MAX_GOALS_PER_CHECK_IN) goals[i] = g.goal_text;
          });
          update({ goals });
          setVisibleGoals(Math.max(2, rows.length));
        }
        const taskRows = await fetchWeeklyTasks(existingId);
        if (taskRows.length > 0) {
          const tasks = ["", "", "", "", ""];
          taskRows.forEach((t, i) => {
            if (i < MAX_TASKS_PER_CHECK_IN) tasks[i] = t.task_text;
          });
          update({ tasks });
          setVisibleTasks(Math.max(2, taskRows.length));
        }
      }
    })();
    setShowForm(true);
  }

  async function handleDelete() {
    if (!existingId) return;
    const confirmed = window.confirm(
      "Delete this week's check-in? This also deletes its goals and cannot be undone."
    );
    if (!confirmed) return;
    try {
      setDeleting(true);
      setError(null);
      await deleteCheckIn(existingId);
      setExistingId(null);
      setSummary(null);
      setPriorGoals([]);
      setThisWeekHabits([]);
      setDraft(EMPTY_DRAFT);
      setVisibleGoals(2);
      setVisibleTasks(2);
      setShowForm(true);
    } catch (e: any) {
      setError(e.message || "Failed to delete check-in");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="growthPage">
      <GrowthSubNav />
      <div className="growthHeaderRow">
        <div>
          <h1 className="growthTitle">Weekly Check-In</h1>
          <div className="growthMuted">Week of {weekStart}</div>
        </div>
        <MemberSwitcher activeSlug={activeSlug} onChange={setActiveSlug} />
      </div>

      {error && <div className="growthError">{error}</div>}
      {memberError && (
        <div className="growthError">
          Couldn't load Devan/Chad profiles ({memberError}). Have you run the Phase 1 migration
          (supabase/migrations/20250924120000_growth_phase1.sql) in the Supabase SQL editor yet?
        </div>
      )}
      {(memberLoading || loadingCheckIn) && <div className="growthMuted">Loading…</div>}

      {!showForm && summary && (
        <div className="growthCard growthSummaryCard">
          <div className="growthSummaryHead">
            <div>
              <h2 className="growthSectionTitle">This week's check-in</h2>
              <div className="growthMuted">Submitted for the week of {summary.week_start}</div>
            </div>
            <ScoreBadge score={summary.overall_score} size="lg" label="Overall score" />
          </div>
          <div className="growthPillarGrid growthPillarGridCompact">
            {GROWTH_PILLARS.map((p) => {
              const val = summary[p.scoreColumn];
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
          {(summary.proud_of || summary.pain_note || summary.life_reflection) && (
            <div className="growthMonthNotes">
              {summary.proud_of && (
                <div>
                  <strong>Proud of:</strong> {summary.proud_of}
                </div>
              )}
              {summary.pain_note && (
                <div>
                  <strong>Pain note:</strong> {summary.pain_note}
                </div>
              )}
              {summary.life_reflection && (
                <div>
                  <strong>How's life going:</strong> {summary.life_reflection}
                </div>
              )}
            </div>
          )}
          <div className="growthSummaryActions">
            <button type="button" className="growthBtnEditSm" onClick={handleEditFromSummary}>
              Edit
            </button>
            <button
              type="button"
              className="growthBtnDangerSm"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <>
          <div className="growthCard">
            <label className="growthLabel">Check-in date</label>
            <input
              type="date"
              className="growthInput"
              value={checkInDate}
              onChange={(e) => setCheckInDate(e.target.value)}
            />
          </div>

          <div className="growthProgressWrap">
            <div className="growthProgressBar">
              <div className="growthProgressFill" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="growthMuted growthProgressLabel">
              {progressPct}% complete{savedAt ? " · draft saved" : ""}
            </div>
          </div>

          {hasPriorGoals && (
            <section className="growthCard">
              <h2 className="growthSectionTitle">Last week's goals</h2>
              <ul className="growthGoalList">
                {priorGoals.map((g) => (
                  <li key={g.id}>
                    <label className="growthGoalDoneRow">
                      <input
                        type="checkbox"
                        checked={goalDone[g.id] ?? false}
                        onChange={async (e) => {
                          const checked = e.target.checked;
                          setGoalDone((prev) => ({ ...prev, [g.id]: checked }));
                          try {
                            await markGoalCompleted(g.id, checked);
                          } catch (err: any) {
                            setError(err.message || "Failed to update goal");
                          }
                        }}
                      />
                      <span>{g.goal_text}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <label className="growthLabel">
                Overall, how well did you follow through on last week's goals? (1-10)
              </label>
              <div className="growthMuted">{FOLLOWTHROUGH_ANCHOR_TEXT}</div>
              <ScoreSlider
                value={draft.goalFollowthrough}
                onChange={(v) => update({ goalFollowthrough: v })}
              />
            </section>
          )}

          {GROWTH_PILLARS.map((pillar) => (
            <section key={pillar.key} className="growthCard">
              <h2 className="growthSectionTitle">{pillar.label}</h2>
              <div className="growthMuted">{pillar.description}</div>

              {pillar.key === "habits" && priorHabits.length > 0 && (
                <div className="growthHabitHistory">
                  <div className="growthMuted growthHabitHistoryIntro">Last week's habits:</div>
                  <div className="growthHabitDayHeader">
                    <div className="growthHabitDots">
                      {DAY_NAMES.map((name) => (
                        <span key={name} className="growthHabitDayLabel">
                          {name.slice(0, 1)}
                        </span>
                      ))}
                    </div>
                  </div>
                  {priorHabits.map((h, i) => (
                    <div key={i} className="growthHabitHistoryRow">
                      <div className="growthHabitHistoryText">{h.habit_text}</div>
                      <div className="growthHabitDots">
                        {h.days.map((status, di) => (
                          <span
                            key={di}
                            className={`growthHabitDot${status ? ` growthHabitDot-${status}` : ""}`}
                            title={`${DAY_NAMES[di]}: ${status === "on" ? "on track" : status === "off" ? "off track" : "not logged"}`}
                          >
                            {status === "on" ? "✓" : status === "off" ? "✕" : ""}
                          </span>
                        ))}
                      </div>
                      <div className="growthMuted growthHabitTotals">
                        {h.onCount} day{h.onCount === 1 ? "" : "s"} on track · {h.offCount} off
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="growthMuted">{PILLAR_ANCHOR_TEXT}</div>
              <ScoreSlider
                value={draft[SCORE_KEY[pillar.key]] as number | null}
                onChange={(v) => update({ [SCORE_KEY[pillar.key]]: v } as Partial<Draft>)}
              />
              {pillar.key === "habits" ? (
                thisWeekHabits.length > 0 ? (
                  <div className="growthHabitLocked">
                    <div className="growthMuted">This week's habits (locked in for the week):</div>
                    <ul className="growthGoalList">
                      {thisWeekHabits.map((h) => (
                        <li key={h.id}>{h.habit_text}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <>
                    <div className="growthMuted">
                      Exactly 2 habits to build or break to track daily this week (tap them on Home each day).
                    </div>
                    {draft.habits.map((t, i) => (
                      <input
                        key={i}
                        className="growthInput growthGoalInput"
                        placeholder={`Habit ${i + 1}`}
                        value={t}
                        maxLength={80}
                        onChange={(e) => {
                          const habits = [...draft.habits];
                          habits[i] = e.target.value;
                          update({ habits });
                        }}
                      />
                    ))}
                  </>
                )
              ) : (
                pillar.key !== "physical" && (
                  <textarea
                    className="growthTextarea"
                    placeholder={`Notes on ${pillar.label.toLowerCase()} (optional)`}
                    value={draft[EPHEMERAL_NOTE_KEY[pillar.key]] as string}
                    onChange={(e) => update({ [EPHEMERAL_NOTE_KEY[pillar.key]]: e.target.value } as Partial<Draft>)}
                  />
                )
              )}
            </section>
          ))}

          <section className="growthCard">
            <h2 className="growthSectionTitle">Proud of</h2>
            <div className="growthMuted">Optional — saved permanently, doesn't affect your score.</div>
            <textarea
              className="growthTextarea"
              placeholder="What are you proud of this week?"
              value={draft.proudOf}
              maxLength={PROUD_OF_MAX_LEN}
              onChange={(e) => update({ proudOf: e.target.value })}
            />
            <div className="growthCharCount">
              {draft.proudOf.length}/{PROUD_OF_MAX_LEN}
            </div>
          </section>

          <section className="growthCard">
            <h2 className="growthSectionTitle">Goals for next week</h2>
            {draft.goals.slice(0, visibleGoals).map((g, i) => (
              <input
                key={i}
                className="growthInput growthGoalInput"
                placeholder={`Goal ${i + 1}`}
                value={g}
                onChange={(e) => {
                  const goals = [...draft.goals];
                  goals[i] = e.target.value;
                  update({ goals });
                }}
              />
            ))}
            {visibleGoals < MAX_GOALS_PER_CHECK_IN && (
              <button
                type="button"
                className="growthBtnAddSlot"
                onClick={() => setVisibleGoals((n) => Math.min(MAX_GOALS_PER_CHECK_IN, n + 1))}
              >
                + Add another goal
              </button>
            )}
          </section>

          <section className="growthCard">
            <h2 className="growthSectionTitle">Small tasks this week</h2>
            <div className="growthMuted">
              What are some small tasks you'd like to accomplish? (e.g. "making an Amazon store") — shown on your Home screen.
            </div>
            {draft.tasks.slice(0, visibleTasks).map((t, i) => (
              <input
                key={i}
                className="growthInput growthGoalInput"
                placeholder={`Task ${i + 1}`}
                value={t}
                onChange={(e) => {
                  const tasks = [...draft.tasks];
                  tasks[i] = e.target.value;
                  update({ tasks });
                }}
              />
            ))}
            {visibleTasks < MAX_TASKS_PER_CHECK_IN && (
              <button
                type="button"
                className="growthBtnAddSlot"
                onClick={() => setVisibleTasks((n) => Math.min(MAX_TASKS_PER_CHECK_IN, n + 1))}
              >
                + Add another task
              </button>
            )}
          </section>

          <section className="growthCard">
            <h2 className="growthSectionTitle">Adjustments</h2>
            <div className="growthMuted">Optional.</div>
            <textarea
              className="growthTextarea"
              placeholder="What will you adjust going forward?"
              value={draft.adjustments}
              onChange={(e) => update({ adjustments: e.target.value })}
            />
          </section>

          <button
            type="button"
            className="growthBtnPrimary"
            onClick={handleSave}
            disabled={saveState === "saving" || !activeMember}
          >
            {saveState === "saving" ? "Saving…" : existingId ? "Update Check-In" : "Save Check-In"}
          </button>
          {existingId && (
            <button
              type="button"
              className="growthBtnDanger"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete this check-in"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function ScoreSlider({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="growthScoreSlider">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
        const color = colorFor(n * 10);
        const active = value === n;
        return (
          <button
            key={n}
            type="button"
            className={`growthScoreDot${active ? " active" : ""}`}
            style={
              active
                ? { borderColor: color, background: color, color: "#1a1200", boxShadow: `0 0 14px ${color}` }
                : { borderColor: color, color }
            }
            onClick={() => onChange(n)}
            aria-label={`Score ${n}`}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}
