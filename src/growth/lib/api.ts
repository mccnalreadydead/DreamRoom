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

  note_physical: string | null;
  note_mental: string | null;
  note_time_energy: string | null;
  note_relationships: string | null;
  note_habits: string | null;
  note_work_money: string | null;

  proud_of: string | null;
  adjustments: string | null;
  reflection: string | null;

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
  "id" | "created_at" | "updated_at"
> & { id?: string };

export async function upsertCheckIn(input: CheckInUpsertInput): Promise<GrowthCheckIn> {
  const { data, error } = await supabase
    .from("growth_check_ins")
    .upsert(input, { onConflict: "member_id,week_start" })
    .select("*")
    .single();
  if (error) throw error;
  return data as GrowthCheckIn;
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
