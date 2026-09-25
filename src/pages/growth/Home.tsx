import { useEffect, useState } from "react";
import GrowthSubNav from "../../growth/components/GrowthSubNav";
import { boundsForWindow, lowestPillar, weekStartMonday } from "../../growth/lib/scoring";
import {
  addDailyTask,
  deleteTask,
  fetchCheckInForWeek,
  fetchGoalsForCheckIn,
  fetchMembers,
  fetchScoredCheckIns,
  fetchTasksForMember,
  fetchWeeklyTasks,
  markGoalCompleted,
  setTaskCompleted,
  type GrowthGoal,
  type GrowthMember,
  type GrowthTask,
} from "../../growth/lib/api";
import "./growth.css";

type MemberHomeData = {
  goals: GrowthGoal[];
  weeklyTasks: GrowthTask[];
  dailyTasks: GrowthTask[];
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const memberRows = await fetchMembers();
        if (cancelled) return;
        setMembers(memberRows);

        const weekStart = weekStartMonday(new Date());
        const { start, end } = boundsForWindow("this_month");

        const next: Record<string, MemberHomeData> = {};
        for (const m of memberRows) {
          const [checkIn, dailyTasks, scoredRows] = await Promise.all([
            fetchCheckInForWeek(m.id, weekStart),
            fetchTasksForMember(m.id, "daily"),
            fetchScoredCheckIns(m.id, start, end),
          ]);
          const [goals, weeklyTasks] = checkIn
            ? await Promise.all([fetchGoalsForCheckIn(checkIn.id), fetchWeeklyTasks(checkIn.id)])
            : [[], []];
          next[m.id] = {
            goals,
            weeklyTasks,
            dailyTasks,
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

  return (
    <div className="growthPage">
      <GrowthSubNav />
      <div className="growthHeaderRow">
        <div>
          <h1 className="growthTitle">Home</h1>
          <div className="growthMuted">This week's goals, small tasks, focus areas, and daily to-dos — for both of you.</div>
        </div>
      </div>

      {error && <div className="growthError">{error}</div>}
      {loading && <div className="growthMuted">Loading…</div>}

      <div className="growthHomeGrid">
        {members.map((m) => {
          const d = data[m.id];
          return (
            <div key={m.id} className="growthCard growthHomeMemberCard">
              <h2 className="growthSectionTitle">{m.display_name}</h2>

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

              <div className="growthHomeSection">
                <div className="growthHomeSectionLabel">Small tasks this week</div>
                {!d?.hasCheckInThisWeek ? (
                  <div className="growthMuted">—</div>
                ) : d.weeklyTasks.length === 0 ? (
                  <div className="growthMuted">No small tasks set this week.</div>
                ) : (
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
                )}
              </div>

              <div className="growthHomeSection">
                <div className="growthHomeSectionLabel">Daily to-dos</div>
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
                {(d?.dailyTasks.filter((t) => !t.completed).length ?? 0) === 0 ? (
                  <div className="growthMuted">Nothing on the list.</div>
                ) : (
                  <ul className="growthHomeTaskList">
                    {d!.dailyTasks
                      .filter((t) => !t.completed)
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
                )}
                {(d?.dailyTasks.filter((t) => t.completed).length ?? 0) > 0 && (
                  <details className="growthHomeDoneDetails">
                    <summary className="growthGoalsSummary">
                      Done ({d!.dailyTasks.filter((t) => t.completed).length})
                    </summary>
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
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
