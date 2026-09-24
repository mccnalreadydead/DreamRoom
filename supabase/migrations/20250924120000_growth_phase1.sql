-- =========================================================
-- DreamRoom "Personal Growth" add-on — Phase 1
-- Additive-only migration. Does NOT touch any existing table,
-- column, policy, or function belonging to sales/inventory/orders/
-- calendar/receipts. Safe to run standalone in the Supabase SQL editor.
-- =========================================================

-- ---------------------------------------------------------
-- growth_members
-- Two known people using the Growth add-on. There is no
-- per-user Supabase auth wired into this app (confirmed: App.tsx
-- has no auth guard, Login.tsx's "Local Mode" bypasses auth
-- entirely). Rows are looked up by `slug` from a client-side
-- localStorage profile switcher — this is NOT real per-user
-- privacy, just a shared-device convenience switch.
-- ---------------------------------------------------------
create table if not exists growth_members (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  created_at timestamptz not null default now()
);

insert into growth_members (slug, display_name)
values ('devan', 'Devan'), ('chad', 'Chad')
on conflict (slug) do nothing;

-- ---------------------------------------------------------
-- growth_check_ins
-- One row per member per ISO week (week_start = Monday).
-- 6 pillar scores + optional goal follow-through score, all
-- 1-10. Each pillar has an optional free-text note. Free-text
-- fields (proud_of, adjustments, reflection, and the per-pillar
-- notes) are treated as author-private in the client UI per
-- GROWTH_PRIVACY in src/growth/lib/constants.ts — the DB itself
-- has no per-user auth to enforce that, so this is a client-side
-- convention only.
-- ---------------------------------------------------------
create table if not exists growth_check_ins (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references growth_members(id) on delete cascade,
  week_start date not null,
  check_in_date date not null default current_date,

  score_physical smallint,
  score_mental smallint,
  score_time_energy smallint,
  score_relationships smallint,
  score_habits smallint,
  score_work_money smallint,
  goal_followthrough smallint,

  note_physical text,
  note_mental text,
  note_time_energy text,
  note_relationships text,
  note_habits text,
  note_work_money text,

  proud_of text,
  adjustments text,
  reflection text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint growth_check_ins_member_week_unique unique (member_id, week_start),
  constraint growth_check_ins_score_physical_range check (score_physical is null or score_physical between 1 and 10),
  constraint growth_check_ins_score_mental_range check (score_mental is null or score_mental between 1 and 10),
  constraint growth_check_ins_score_time_energy_range check (score_time_energy is null or score_time_energy between 1 and 10),
  constraint growth_check_ins_score_relationships_range check (score_relationships is null or score_relationships between 1 and 10),
  constraint growth_check_ins_score_habits_range check (score_habits is null or score_habits between 1 and 10),
  constraint growth_check_ins_score_work_money_range check (score_work_money is null or score_work_money between 1 and 10),
  constraint growth_check_ins_goal_followthrough_range check (goal_followthrough is null or goal_followthrough between 1 and 10)
);

create index if not exists growth_check_ins_member_week_idx
  on growth_check_ins (member_id, week_start);

-- keep updated_at current on writes
create or replace function growth_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists growth_check_ins_set_updated_at on growth_check_ins;
create trigger growth_check_ins_set_updated_at
  before update on growth_check_ins
  for each row execute function growth_set_updated_at();

-- ---------------------------------------------------------
-- growth_goals
-- Up to 5 goals set during a check-in, carried over and shown
-- (with a follow-through score) on the following week's check-in.
-- ---------------------------------------------------------
create table if not exists growth_goals (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references growth_members(id) on delete cascade,
  check_in_id uuid not null references growth_check_ins(id) on delete cascade,
  goal_text text not null,
  sort_order smallint not null default 0,
  completed boolean,
  created_at timestamptz not null default now()
);

create index if not exists growth_goals_member_week_idx
  on growth_goals (member_id, check_in_id);

-- ---------------------------------------------------------
-- growth_check_in_scores
-- Single source of truth for the 0-100 overall score so no
-- component recomputes it. overall_score = round(avg(available
-- pillar scores among the 6 pillars + goal_followthrough when
-- present) * 10). Rows with zero scored fields yield a null score.
-- ---------------------------------------------------------
create or replace view growth_check_in_scores as
select
  ci.*,
  round(avg(v.val) * 10) as overall_score,
  count(v.val)::int as scored_field_count
from growth_check_ins ci
cross join lateral (
  select val
  from unnest(array[
    ci.score_physical,
    ci.score_mental,
    ci.score_time_energy,
    ci.score_relationships,
    ci.score_habits,
    ci.score_work_money,
    ci.goal_followthrough
  ]) as val
  where val is not null
) v
group by ci.id;

-- ---------------------------------------------------------
-- Row Level Security
-- Intentionally permissive: this app has no per-user Supabase
-- auth, so there is no `auth.uid()` to scope policies to. These
-- policies simply allow the anon client (used by the whole app)
-- to read/write, matching how every other table in this project
-- is already accessed. Revisit if/when real per-user auth lands.
-- ---------------------------------------------------------
alter table growth_members enable row level security;
alter table growth_check_ins enable row level security;
alter table growth_goals enable row level security;

drop policy if exists growth_members_all on growth_members;
create policy growth_members_all on growth_members
  for all using (true) with check (true);

drop policy if exists growth_check_ins_all on growth_check_ins;
create policy growth_check_ins_all on growth_check_ins
  for all using (true) with check (true);

drop policy if exists growth_goals_all on growth_goals;
create policy growth_goals_all on growth_goals
  for all using (true) with check (true);
