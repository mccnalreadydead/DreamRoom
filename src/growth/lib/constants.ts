// Shared config for the Personal Growth add-on. Single source of truth
// so privacy/scoring/pillar rules aren't scattered across components.

export type MemberSlug = "devan" | "chad";

export const GROWTH_MEMBERS: { slug: MemberSlug; displayName: string }[] = [
  { slug: "devan", displayName: "Devan" },
  { slug: "chad", displayName: "Chad" },
];

export const ACTIVE_MEMBER_STORAGE_KEY = "growth_active_member_slug";

// There is no real per-user auth in this app (no auth guard in App.tsx,
// Login.tsx offers a no-login "Local Mode"). This switcher is a shared-
// device convenience, NOT real security — anyone using this browser can
// flip profiles. By design there is no privacy split between Devan and
// Chad: both can see all scores, the pain log, and the long-term goals box.

// Only these two written fields are ever persisted (forever); every other
// text prompt on the check-in (per-pillar notes, proud-of, adjustments) is
// part of the in-the-moment reflection process only and is never sent to
// the database — only its associated numeric pillar score is stored.
export const PAIN_NOTE_MAX_LEN = 600;
export const LIFE_REFLECTION_MAX_LEN = 600;

export type PillarKey =
  | "physical"
  | "mental"
  | "time_energy"
  | "relationships"
  | "habits"
  | "work_money";

export type PillarDef = {
  key: PillarKey;
  label: string;
  description: string;
  scoreColumn: `score_${PillarKey}`;
};

export const GROWTH_PILLARS: PillarDef[] = [
  {
    key: "physical",
    label: "Physical",
    description: "How do you feel physically this week? (gym, walking, stretching, sleep, energy)",
    scoreColumn: "score_physical",
  },
  {
    key: "mental",
    label: "Mental",
    description: "How is your mental state this week? (mood, stress, focus)",
    scoreColumn: "score_mental",
  },
  {
    key: "time_energy",
    label: "Time",
    description: "Are you happy with how you spent your time and energy this week?",
    scoreColumn: "score_time_energy",
  },
  {
    key: "relationships",
    label: "Relationships",
    description: "Are you happy with the time you spent with family, friends, and people who matter to you?",
    scoreColumn: "score_relationships",
  },
  {
    key: "habits",
    label: "Habits",
    description: "How well are you building the habits you want and dropping the ones you don't?",
    scoreColumn: "score_habits",
  },
  {
    key: "work_money",
    label: "Work & Money",
    description: "How happy are you with your progress on work and your side business?",
    scoreColumn: "score_work_money",
  },
];

// Anchor text shown under every pillar's 1-10 selector, per spec.
export const PILLAR_ANCHOR_TEXT = "1 = really bad, 10 = outstanding";
export const FOLLOWTHROUGH_ANCHOR_TEXT =
  "1 = barely did anything, 10 = crushed every one";

export const MAX_GOALS_PER_CHECK_IN = 5;
export const MAX_TASKS_PER_CHECK_IN = 5;
export const MAX_HABITS_PER_CHECK_IN = 3;
export const PROUD_OF_MAX_LEN = 600;

// Color bands applied to overall score, each pillar, and chart dots.
export const SCORE_COLOR_BANDS = {
  red: { max: 59, color: "#ff5b5b" },
  yellow: { max: 79, color: "#f2c94c" },
  green: { max: 100, color: "#3ddc84" },
} as const;

export type TimeWindow =
  | "this_month"
  | "last_month"
  | "3_months"
  | "6_months"
  | "1_year"
  | "all_time";

export const TIME_WINDOW_OPTIONS: { value: TimeWindow; label: string }[] = [
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "3_months", label: "3 Months" },
  { value: "6_months", label: "6 Months" },
  { value: "1_year", label: "1 Year" },
  { value: "all_time", label: "All Time" },
];

// Greyed-out placeholder for the persistent long-term goals box (Pillars page).
export const LONG_TERM_GOALS_PLACEHOLDER =
  "e.g.\n- Pay off the car by next summer\n- Get to the gym 3x/week consistently\n- Take a real vacation with no work emails\n- Grow the side business to $X/month";
