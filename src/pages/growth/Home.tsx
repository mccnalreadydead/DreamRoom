import { useEffect, useState } from "react";
import GrowthSubNav from "../../growth/components/GrowthSubNav";
import { boundsForWindow, lowestPillar, weekDates, weekStartMonday, DAY_LABELS, DAY_NAMES } from "../../growth/lib/scoring";
import {
  addDailyTask,
  deleteTask,
  fetchCheckInForWeek,
  fetchGoalsForCheckIn,
  fetchHabitLogs,
  fetchHabitsForCheckIn,
  fetchMembers,
  fetchScoredCheckIns,
  fetchTasksForMember,
  fetchWeeklyTasks,
  markGoalCompleted,
  setHabitLogStatus,
  setTaskCompleted,
  type GrowthGoal,
  type GrowthHabit,
  type GrowthHabitLog,
  type GrowthMember,
  type GrowthTask,
} from "../../growth/lib/api";
import "./growth.css";

type MemberHomeData = {
  goals: GrowthGoal[];
  weeklyTasks: GrowthTask[];
  dailyTasks: GrowthTask[];
  habits: GrowthHabit[];
  habitLogs: GrowthHabitLog[];
  focus: { label: string; avg: number } | null;
  hasCheckInThisWeek: boolean;
};

export default function Home() {
  const [members, setMembers] = useState<GrowthMember[]>([]);
  const [data, setData] = useState<Record<string, MemberHomeData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newDailyText, setNewDailyText] = useState<Record<string, string>>({});
  const [reloadKey, setReloadKey] = useState(0);

  const weekStart = weekStartMonday(new Date());
  const dates = weekDates(weekStart);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const memberRows = await fetchMembers();
        if (cancelled) return;
        setMembers(memberRows);

        const { start, end } = boundsForWindow("this_month");

        const next: Record<string, MemberHomeData> = {};
        for (const m of memberRows) {
          const [checkIn, dailyTasks, scoredRows] = await Promise.all([
            fetchCheckInForWeek(m.id, weekStart),
            fetchTasksForMember(m.id, "daily"),
            fetchScoredCheckIns(m.id, start, end),
          ]);
          const [goals, weeklyTasks, habits] = checkIn
            ? await Promise.all([
                fetchGoalsForCheckIn(checkIn.id),
                fetchWeeklyTasks(checkIn.id),
                fetchHabitsForCheckIn(checkIn.id),
              ])
            : [[], [], []];
          const habitLogs = habits.length > 0 ? await fetchHabitLogs(habits.map((h) => h.id)) : [];
          next[m.id] = {
            goals,
            weeklyTasks,
            dailyTasks,
            habits,
            habitLogs,
            focus: lowestPillar(scoredRows),
            hasCheckInThisWeek: !!checkIn,
          };
        }
        if (!cancelled) setData(next);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Failed to load Home");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  function reload() {
    setReloadKey((k) => k + 1);
  }

  async function handleToggleGoal(goalId: string, completed: boolean) {
    try {
      await markGoalCompleted(goalId, completed);
      reload();
    } catch (e: any) {
      setError(e.message || "Failed to update goal");
    }
  }

  async function handleToggleTask(taskId: string, completed: boolean) {
    try {
      await setTaskCompleted(taskId, completed);
      reload();
    } catch (e: any) {
      setError(e.message || "Failed to update task");
    }
  }

  async function handleDeleteTask(taskId: string) {
    try {
      await deleteTask(taskId);
      reload();
    } catch (e: any) {
      setError(e.message || "Failed to delete task");
    }
  }

  async function handleAddDaily(memberId: string) {
    const text = (newDailyText[memberId] ?? "").trim();
    if (!text) return;
    try {
      await addDailyTask(memberId, text);
      setNewDailyText((prev) => ({ ...prev, [memberId]: "" }));
      reload();
    } catch (e: any) {
      setError(e.message || "Failed to add task");
    }
  }

  async function handleTapHabitDay(
    memberId: string,
    habitId: string,
    logDate: string,
    current: "on" | "off" | null
  ) {
    const next = current === null ? "on" : current === "on" ? "off" : null;
    try {
      await setHabitLogStatus(habitId, memberId, logDate, next);
      reload();
    } catch (e: any) {
      setError(e.message || "Failed to update habit");
    }
  }

  return (
    <div className="growthPage">
      <GrowthSubNav />
      <div className="growthHeaderRow">
        <div>
          <h1 className="growthTitle">Home</h1>
          <div className="growthMuted">This week's habits, goals, and focus — for both of you.</div>
        </div>
      </div>

      {error && <div className="growthError">{error}</div>}
      {loading && <div className="growthMuted">Loading…</div>}

      <div className="growthHomeGrid">
        {members.map((m) => {
          const d = data[m.id];
          const doneCount = d?.dailyTasks.filter((t) => t.completed).length ?? 0;
          const activeDaily = d?.dailyTasks.filter((t) => !t.completed) ?? [];
          return (
            <div key={m.id} className="growthCard growthHomeMemberCard">
              <h2 className="growthSectionTitle">{m.display_name}</h2>

              {/* Focus area — always visible */}
              <div className="growthHomeSection">
                <div className="growthHomeSectionLabel">Focus area</div>
                {d?.focus ? (
                  <div className="growthCallout growthHomeFocusCallout">
                    {d.focus.label} is the lowest-scoring pillar this month (avg {Math.round(d.focus.avg * 10) / 10}/10).
                  </div>
                ) : (
                  <div className="growthMuted">No data yet this month.</div>
                )}
              </div>

              {/* Habit trackers — always visible, the visual anchor of the page */}
              <div className="growthHomeSection growthHomeHabitsSection">
                <div className="growthHomeSectionLabel">Habit trackers</div>
                {!d?.hasCheckInThisWeek ? (
                  <div className="growthMuted">Submit this week's check-in to set your 3 habits.</div>
                ) : d.habits.length === 0 ? (
                  <div className="growthMuted">No habits set this week.</div>
                ) : (
                  d.habits.map((h) => {
                    const dayStatus = dates.map((day) => {
                      const log = d.habitLogs.find((l) => l.habit_id === h.id && l.log_date === day);
                      return (log?.status as "on" | "off" | undefined) ?? null;
                    });
                    const onCount = dayStatus.filter((s) => s === "on").length;
                    const offCount = dayStatus.filter((s) => s === "off").length;
                    return (
                      <div key={h.id} className="growthHabitTrackerRow">
                        <div className="growthHabitTrackerText">{h.habit_text}</div>
                        <div className="growthHabitDots">
                          {dates.map((day, di) => {
                            const status = dayStatus[di];
                            return (
                              <button
                                key={day}
                                type="button"
                                className={`growthHabitDot growthHabitDotTap${status ? ` growthHabitDot-${status}` : ""}`}
                                title={`${DAY_NAMES[di]}: ${status === "on" ? "on track" : status === "off" ? "off track" : "tap to log"}`}
                                onClick={() => handleTapHabitDay(m.id, h.id, day, status)}
                              >
                                {DAY_LABELS[di]}
                              </button>
                            );
                          })}
                        </div>
                        <div className="growthMuted growthHabitTotals">
                          {onCount} on track · {offCount} off
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Weekly goals — always visible */}
              <div className="growthHomeSection">
                <div className="growthHomeSectionLabel">This week's goals</div>
                {!d?.hasCheckInThisWeek ? (
                  <div className="growthMuted">No check-in submitted yet this week.</div>
                ) : d.goals.length === 0 ? (
                  <div className="growthMuted">No goals set this week.</div>
                ) : (
                  <ul className="growthGoalList">
                    {d.goals.map((g) => (
                      <li key={g.id}>
                        <label className="growthGoalDoneRow">
                          <input
                            type="checkbox"
                            checked={g.completed ?? false}
                            onChange={(e) => handleToggleGoal(g.id, e.target.checked)}
                          />
                          <span>{g.goal_text}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Small tasks — de-emphasized, secondary to goals/habits */}
              {d?.hasCheckInThisWeek && d.weeklyTasks.length > 0 && (
                <div className="growthHomeSection growthHomeMinorSection">
                  <div className="growthHomeSectionLabel growthHomeSectionLabelMinor">Small tasks this week</div>
                  <ul className="growthGoalList">
                    {d.weeklyTasks.map((t) => (
                      <li key={t.id}>
                        <label className="growthGoalDoneRow">
                          <input
                            type="checkbox"
                            checked={t.completed}
                            onChange={(e) => handleToggleTask(t.id, e.target.checked)}
                          />
                          <span>{t.task_text}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Daily to-dos — the only collapsible section, closed by default */}
              <details className="growthHomeSection growthHomeMinorSection growthHomeDailyDetails">
                <summary className="growthGoalsSummary">
                  Daily to-dos {activeDaily.length > 0 ? `(${activeDaily.length})` : ""}
                </summary>
                <div className="growthHomeAddRow">
                  <input
                    className="growthInput"
                    placeholder="e.g. laundry, dishes"
                    value={newDailyText[m.id] ?? ""}
                    onChange={(e) => setNewDailyText((prev) => ({ ...prev, [m.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddDaily(m.id);
                    }}
                  />
                  <button type="button" className="growthBtnEditSm" onClick={() => handleAddDaily(m.id)}>
                    Add
                  </button>
                </div>
                {activeDaily.length === 0 ? (
                  <div className="growthMuted">Nothing on the list.</div>
                ) : (
                  <ul className="growthHomeTaskList">
                    {activeDaily.map((t) => (
                      <li key={t.id} className="growthHomeTaskRow">
                        <label className="growthGoalDoneRow">
                          <input
                            type="checkbox"
                            checked={t.completed}
                            onChange={(e) => handleToggleTask(t.id, e.target.checked)}
                          />
                          <span>{t.task_text}</span>
                        </label>
                        <button type="button" className="growthBtnDangerSm" onClick={() => handleDeleteTask(t.id)}>
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {doneCount > 0 && (
                  <details className="growthHomeDoneDetails">
                    <summary className="growthGoalsSummary">Done ({doneCount})</summary>
                    <ul className="growthHomeTaskList">
                      {d!.dailyTasks
                        .filter((t) => t.completed)
                        .map((t) => (
                          <li key={t.id} className="growthHomeTaskRow">
                            <label className="growthGoalDoneRow">
                              <input
                                type="checkbox"
                                checked={t.completed}
                                onChange={(e) => handleToggleTask(t.id, e.target.checked)}
                              />
                              <span>{t.task_text}</span>
                            </label>
                            <button
                              type="button"
                              className="growthBtnDangerSm"
                              onClick={() => handleDeleteTask(t.id)}
                            >
                              Delete
                            </button>
                          </li>
                        ))}
                    </ul>
                  </details>
                )}
              </details>
            </div>
          );
        })}
      </div>
    </div>
  );
}

