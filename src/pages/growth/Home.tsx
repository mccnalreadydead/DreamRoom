import { useEffect, useState } from "react";
import GrowthSubNav from "../../growth/components/GrowthSubNav";
import MemberSwitcher from "../../growth/components/MemberSwitcher";
import { useActiveMember } from "../../growth/hooks/useActiveMember";
import { boundsForWindow, lowestPillar, weekDates, weekStartMonday, DAY_NAMES } from "../../growth/lib/scoring";
import {
  addDailyTask,
  deleteTask,
  fetchCheckInForWeek,
  fetchGoalsForCheckIn,
  fetchHabitLogs,
  fetchHabitsForCheckIn,
  fetchScoredCheckIns,
  fetchTasksForMember,
  fetchWeeklyTasks,
  setHabitLogStatus,
  setTaskCompleted,
  type GrowthGoal,
  type GrowthHabit,
  type GrowthHabitLog,
  type GrowthTask,
} from "../../growth/lib/api";
import "./growth.css";

type HomeData = {
  goals: GrowthGoal[];
  weeklyTasks: GrowthTask[];
  dailyTasks: GrowthTask[];
  habits: GrowthHabit[];
  habitLogs: GrowthHabitLog[];
  focus: { label: string; avg: number } | null;
  hasCheckInThisWeek: boolean;
};

const weekStart = weekStartMonday(new Date());
const dates = weekDates(weekStart);

export default function Home() {
  const { activeSlug, setActiveSlug, activeMember, loading: memberLoading, error: memberError } = useActiveMember();
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newDailyText, setNewDailyText] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!activeMember) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const { start, end } = boundsForWindow("this_month");
        const [checkIn, dailyTasks, scoredRows] = await Promise.all([
          fetchCheckInForWeek(activeMember.id, weekStart),
          fetchTasksForMember(activeMember.id, "daily"),
          fetchScoredCheckIns(activeMember.id, start, end),
        ]);
        const [goals, weeklyTasks, habits] = checkIn
          ? await Promise.all([
              fetchGoalsForCheckIn(checkIn.id),
              fetchWeeklyTasks(checkIn.id),
              fetchHabitsForCheckIn(checkIn.id),
            ])
          : [[], [], []];
        const habitLogs = habits.length > 0 ? await fetchHabitLogs(habits.map((h) => h.id)) : [];
        if (!cancelled) {
          setData({
            goals,
            weeklyTasks,
            dailyTasks,
            habits,
            habitLogs,
            focus: lowestPillar(scoredRows),
            hasCheckInThisWeek: !!checkIn,
          });
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Failed to load Home");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeMember?.id, reloadKey]);

  function reload() {
    setReloadKey((k) => k + 1);
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

  async function handleAddDaily() {
    if (!activeMember) return;
    const text = newDailyText.trim();
    if (!text) return;
    try {
      await addDailyTask(activeMember.id, text);
      setNewDailyText("");
      reload();
    } catch (e: any) {
      setError(e.message || "Failed to add task");
    }
  }

  async function handleTapHabitDay(habitId: string, logDate: string, current: "on" | "off" | null) {
    if (!activeMember) return;
    const next = current === null ? "on" : current === "on" ? "off" : null;
    try {
      await setHabitLogStatus(habitId, activeMember.id, logDate, next);
      reload();
    } catch (e: any) {
      setError(e.message || "Failed to update habit");
    }
  }

  const doneCount = data?.dailyTasks.filter((t) => t.completed).length ?? 0;
  const activeDaily = data?.dailyTasks.filter((t) => !t.completed) ?? [];

  return (
    <div className="growthPage">
      <GrowthSubNav />
      <div className="growthHeaderRow">
        <div>
          <h1 className="growthTitle">Home</h1>
          <div className="growthMuted">This week's habits, goals, and focus.</div>
        </div>
        <MemberSwitcher activeSlug={activeSlug} onChange={setActiveSlug} />
      </div>

      {error && <div className="growthError">{error}</div>}
      {memberError && <div className="growthError">Couldn't load profiles ({memberError}).</div>}
      {(memberLoading || loading) && <div className="growthMuted">Loading…</div>}

      <div className="growthCard growthHomeMemberCard">
        {/* Focus area — always visible */}
        <div className="growthHomeSection">
          <div className="growthHomeSectionLabel">Focus area</div>
          {data?.focus ? (
            <div className="growthCallout growthHomeFocusCallout">
              {data.focus.label} is the lowest-scoring pillar this month (avg {Math.round(data.focus.avg * 10) / 10}/10).
            </div>
          ) : (
            <div className="growthMuted">No data yet this month.</div>
          )}
        </div>

        {/* Habit trackers — always visible, the visual anchor of the page */}
        <div className="growthHomeSection growthHomeHabitsSection">
          <div className="growthHomeSectionLabel">Habit trackers</div>
          {!data?.hasCheckInThisWeek ? (
            <div className="growthMuted">Submit this week's check-in to set your 2 habits.</div>
          ) : data.habits.length === 0 ? (
            <div className="growthMuted">No habits set this week.</div>
          ) : (
            <>
              <div className="growthHabitDayHeader">
                <div className="growthHabitDots">
                  {DAY_NAMES.map((name) => (
                    <span key={name} className="growthHabitDayLabel">
                      {name.slice(0, 1)}
                    </span>
                  ))}
                </div>
              </div>
              {data.habits.map((h) => {
                const dayStatus = dates.map((day) => {
                  const log = data.habitLogs.find((l) => l.habit_id === h.id && l.log_date === day);
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
                            aria-label={`${DAY_NAMES[di]}: ${status === "on" ? "on track" : status === "off" ? "off track" : "not logged, tap to mark on track"}`}
                            onClick={() => handleTapHabitDay(h.id, day, status)}
                          >
                            {status === "on" ? "✓" : status === "off" ? "✕" : ""}
                          </button>
                        );
                      })}
                    </div>
                    <div className="growthMuted growthHabitTotals">
                      {onCount} on track · {offCount} off
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Weekly goals — always visible */}
        <div className="growthHomeSection">
          <div className="growthHomeSectionLabel">This week's goals</div>
          {!data?.hasCheckInThisWeek ? (
            <div className="growthMuted">No check-in submitted yet this week.</div>
          ) : data.goals.length === 0 ? (
            <div className="growthMuted">No goals set this week.</div>
          ) : (
            <ol className="growthGoalNumberedList">
              {data.goals.map((g) => (
                <li key={g.id}>{g.goal_text}</li>
              ))}
            </ol>
          )}
        </div>

        {/* Small tasks — de-emphasized, secondary to goals/habits */}
        {data?.hasCheckInThisWeek && data.weeklyTasks.length > 0 && (
          <div className="growthHomeSection growthHomeMinorSection">
            <div className="growthHomeSectionLabel growthHomeSectionLabelMinor">Small tasks this week</div>
            <ul className="growthGoalList">
              {data.weeklyTasks.map((t) => (
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
          <summary className="growthGoalsSummary growthCaretSummary">
            <span className="growthCaret">▸</span>
            Daily to-dos {activeDaily.length > 0 ? `(${activeDaily.length})` : ""}
          </summary>
          <div className="growthHomeAddRow">
            <input
              className="growthInput"
              placeholder="e.g. laundry, dishes"
              value={newDailyText}
              onChange={(e) => setNewDailyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddDaily();
              }}
            />
            <button type="button" className="growthBtnEditSm" onClick={handleAddDaily}>
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
              <summary className="growthGoalsSummary growthCaretSummary">
                <span className="growthCaret">▸</span>
                Done ({doneCount})
              </summary>
              <ul className="growthHomeTaskList">
                {data!.dailyTasks
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
                      <button type="button" className="growthBtnDangerSm" onClick={() => handleDeleteTask(t.id)}>
                        Delete
                      </button>
                    </li>
                  ))}
              </ul>
            </details>
          )}
        </details>
      </div>
    </div>
  );
}

