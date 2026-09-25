import { supabase } from "../../supabaseClient";
import type { MemberSlug } from "./constants";
import { toDateKey } from "./scoring";

export type GrowthMember = {
  id: string;
  slug: MemberSlug;
  display_name: string;
  created_at: string;
};

export type GrowthCheckIn = {
  id: string;
  member_id: string;
  week_start: string;
  check_in_date: string;

  score_physical: number | null;
  score_mental: number | null;
  score_time_energy: number | null;
  score_relationships: number | null;
  score_habits: number | null;
  score_work_money: number | null;
  goal_followthrough: number | null;

  // Legacy permanent fields from an earlier iteration — no longer written
  // by the app, but preserved on old rows so history isn't lost.
  pain_note: string | null;
  life_reflection: string | null;
  // The one written field kept forever going forward (see constants.ts):
  // optional, doesn't affect the score.
  proud_of: string | null;

  created_at: string;
  updated_at: string;
};

export type GrowthCheckInScored = GrowthCheckIn & {
  overall_score: number | null;
  scored_field_count: number;
};

export type GrowthGoal = {
  id: string;
  member_id: string;
  check_in_id: string;
  goal_text: string;
  sort_order: number;
  completed: boolean | null;
  created_at: string;
};

export async function fetchMembers(): Promise<GrowthMember[]> {
  const { data, error } = await supabase
    .from("growth_members")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as GrowthMember[];
}

export async function fetchCheckInForWeek(
  memberId: string,
  weekStart: string
): Promise<GrowthCheckIn | null> {
  const { data, error } = await supabase
    .from("growth_check_ins")
    .select("*")
    .eq("member_id", memberId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error) throw error;
  return (data as GrowthCheckIn) ?? null;
}

/** Most recent check-in strictly before the given week, used for goal carryover. */
export async function fetchPriorCheckIn(
  memberId: string,
  beforeWeekStart: string
): Promise<GrowthCheckIn | null> {
  const { data, error } = await supabase
    .from("growth_check_ins")
    .select("*")
    .eq("member_id", memberId)
    .lt("week_start", beforeWeekStart)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as GrowthCheckIn) ?? null;
}

export async function fetchGoalsForCheckIn(checkInId: string): Promise<GrowthGoal[]> {
  const { data, error } = await supabase
    .from("growth_goals")
    .select("*")
    .eq("check_in_id", checkInId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as GrowthGoal[];
}

export type CheckInUpsertInput = Omit<
  GrowthCheckIn,
  "id" | "created_at" | "updated_at" | "pain_note" | "life_reflection"
> & { id?: string; pain_note?: string | null; life_reflection?: string | null };

export async function upsertCheckIn(input: CheckInUpsertInput): Promise<GrowthCheckIn> {
  const { data, error } = await supabase
    .from("growth_check_ins")
    .upsert(input, { onConflict: "member_id,week_start" })
    .select("*")
    .single();
  if (error) throw error;
  return data as GrowthCheckIn;
}

/** Deletes a check-in and (via FK cascade) its goals. Cannot be undone. */
export async function deleteCheckIn(checkInId: string): Promise<void> {
  const { error } = await supabase.from("growth_check_ins").delete().eq("id", checkInId);
  if (error) throw error;
}

export async function replaceGoals(
  checkInId: string,
  memberId: string,
  goals: { goal_text: string; sort_order: number; completed?: boolean | null }[]
): Promise<void> {
  const { error: delErr } = await supabase
    .from("growth_goals")
    .delete()
    .eq("check_in_id", checkInId);
  if (delErr) throw delErr;

  const rows = goals
    .filter((g) => g.goal_text.trim().length > 0)
    .map((g) => ({
      member_id: memberId,
      check_in_id: checkInId,
      goal_text: g.goal_text.trim(),
      sort_order: g.sort_order,
      completed: g.completed ?? null,
    }));

  if (rows.length === 0) return;

  const { error: insErr } = await supabase.from("growth_goals").insert(rows);
  if (insErr) throw insErr;
}

export async function markGoalCompleted(goalId: string, completed: boolean): Promise<void> {
  const { error } = await supabase
    .from("growth_goals")
    .update({ completed })
    .eq("id", goalId);
  if (error) throw error;
}

export async function fetchScoredCheckIns(
  memberId: string,
  start: Date,
  end: Date
): Promise<GrowthCheckInScored[]> {
  const { data, error } = await supabase
    .from("growth_check_in_scores")
    .select("*")
    .eq("member_id", memberId)
    .gte("week_start", toDateKey(start))
    .lte("week_start", toDateKey(end))
    .order("week_start", { ascending: true });
  if (error) throw error;
  return (data ?? []) as GrowthCheckInScored[];
}

/** Fetches one check-in with its computed overall_score, e.g. right after saving. */
export async function fetchScoredCheckInById(id: string): Promise<GrowthCheckInScored | null> {
  const { data, error } = await supabase
    .from("growth_check_in_scores")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as GrowthCheckInScored) ?? null;
}

// ---------------------------------------------------------------------
// Long-term goals (persistent free-text box on the Pillars page)
// ---------------------------------------------------------------------
export async function fetchLongTermGoals(memberId: string): Promise<string> {
  const { data, error } = await supabase
    .from("growth_long_term_goals")
    .select("content")
    .eq("member_id", memberId)
    .maybeSingle();
  if (error) throw error;
  return data?.content ?? "";
}

export async function saveLongTermGoals(memberId: string, content: string): Promise<void> {
  const { error } = await supabase
    .from("growth_long_term_goals")
    .upsert({ member_id: memberId, content }, { onConflict: "member_id" });
  if (error) throw error;
}

// ---------------------------------------------------------------------
// growth_tasks: 'weekly' small tasks (tied to a check-in) and 'daily'
// to-dos (not tied to any check-in) — both surfaced on the Home tab.
// ---------------------------------------------------------------------
export type GrowthTask = {
  id: string;
  member_id: string;
  kind: "weekly" | "daily";
  check_in_id: string | null;
  task_text: string;
  completed: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export async function fetchWeeklyTasks(checkInId: string): Promise<GrowthTask[]> {
  const { data, error } = await supabase
    .from("growth_tasks")
    .select("*")
    .eq("check_in_id", checkInId)
    .eq("kind", "weekly")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as GrowthTask[];
}

/** Replaces all 'weekly' tasks for a check-in (mirrors replaceGoals). */
export async function replaceWeeklyTasks(
  checkInId: string,
  memberId: string,
  tasks: { task_text: string; sort_order: number }[]
): Promise<void> {
  const { error: delErr } = await supabase
    .from("growth_tasks")
    .delete()
    .eq("check_in_id", checkInId)
    .eq("kind", "weekly");
  if (delErr) throw delErr;

  const rows = tasks
    .filter((t) => t.task_text.trim().length > 0)
    .map((t) => ({
      member_id: memberId,
      check_in_id: checkInId,
      kind: "weekly" as const,
      task_text: t.task_text.trim(),
      sort_order: t.sort_order,
    }));
  if (rows.length === 0) return;

  const { error: insErr } = await supabase.from("growth_tasks").insert(rows);
  if (insErr) throw insErr;
}

export async function fetchTasksForMember(
  memberId: string,
  kind: "weekly" | "daily"
): Promise<GrowthTask[]> {
  const { data, error } = await supabase
    .from("growth_tasks")
    .select("*")
    .eq("member_id", memberId)
    .eq("kind", kind)
    .order("completed", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as GrowthTask[];
}

export async function addDailyTask(memberId: string, taskText: string): Promise<GrowthTask> {
  const { data, error } = await supabase
    .from("growth_tasks")
    .insert({ member_id: memberId, kind: "daily", task_text: taskText.trim() })
    .select("*")
    .single();
  if (error) throw error;
  return data as GrowthTask;
}

export async function setTaskCompleted(id: string, completed: boolean): Promise<void> {
  const { error } = await supabase.from("growth_tasks").update({ completed }).eq("id", id);
  if (error) throw error;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from("growth_tasks").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------
// growth_habits / growth_habit_logs: exactly 3 habit slots per check-in,
// each with a per-day on/off log (Home tab day-dot rows).
// ---------------------------------------------------------------------
export type GrowthHabit = {
  id: string;
  member_id: string;
  check_in_id: string;
  habit_text: string;
  sort_order: number;
  created_at: string;
};

export type GrowthHabitLog = {
  id: string;
  habit_id: string;
  member_id: string;
  log_date: string;
  status: "on" | "off";
  created_at: string;
  updated_at: string;
};

export async function fetchHabitsForCheckIn(checkInId: string): Promise<GrowthHabit[]> {
  const { data, error } = await supabase
    .from("growth_habits")
    .select("*")
    .eq("check_in_id", checkInId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as GrowthHabit[];
}

/**
 * Habits are a fixed commitment for the week they're set in — this only
 * inserts them the first time a check-in is saved (if none exist yet).
 * It never deletes/replaces existing habit rows, so day-logs tied to them
 * (via FK cascade) are never lost by re-saving the same check-in.
 */
export async function ensureHabitsForCheckIn(
  checkInId: string,
  memberId: string,
  habitTexts: string[]
): Promise<void> {
  const existing = await fetchHabitsForCheckIn(checkInId);
  if (existing.length > 0) return;

  const rows = habitTexts
    .map((text, i) => ({ text: text.trim(), sort_order: i }))
    .filter((h) => h.text.length > 0)
    .map((h) => ({
      member_id: memberId,
      check_in_id: checkInId,
      habit_text: h.text,
      sort_order: h.sort_order,
    }));
  if (rows.length === 0) return;

  const { error } = await supabase.from("growth_habits").insert(rows);
  if (error) throw error;
}

export async function fetchHabitLogs(habitIds: string[]): Promise<GrowthHabitLog[]> {
  if (habitIds.length === 0) return [];
  const { data, error } = await supabase
    .from("growth_habit_logs")
    .select("*")
    .in("habit_id", habitIds);
  if (error) throw error;
  return (data ?? []) as GrowthHabitLog[];
}

/** Cycles a day's status: null (blank) -> 'on' -> 'off' -> null. Pass the next status explicitly. */
export async function setHabitLogStatus(
  habitId: string,
  memberId: string,
  logDate: string,
  status: "on" | "off" | null
): Promise<void> {
  if (status === null) {
    const { error } = await supabase
      .from("growth_habit_logs")
      .delete()
      .eq("habit_id", habitId)
      .eq("log_date", logDate);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("growth_habit_logs")
    .upsert(
      { habit_id: habitId, member_id: memberId, log_date: logDate, status },
      { onConflict: "habit_id,log_date" }
    );
  if (error) throw error;
}
