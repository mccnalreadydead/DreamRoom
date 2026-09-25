-- =========================================================
-- DreamRoom "Personal Growth" add-on — Phase 3
-- Only touches the growth_* tables (our own feature tables).
-- Does NOT touch any sales/inventory/orders/calendar/receipts table.
-- Safe to run standalone in the Supabase SQL editor, AFTER phase 1 + 2.
--
-- Retention change: going forward, "Proud of this week" is the only
-- written field kept forever alongside the pillar scores (optional,
-- does not affect the score). pain_note/life_reflection columns are
-- left in place (so existing entries aren't lost) but the app no
-- longer writes new values to them.
-- =========================================================

alter table growth_check_ins add column if not exists proud_of text;
alter table growth_check_ins
  drop constraint if exists growth_check_ins_proud_of_len,
  add constraint growth_check_ins_proud_of_len
    check (proud_of is null or char_length(proud_of) <= 600);

-- growth_check_in_scores selects ci.*, which Postgres resolves to a fixed
-- column list at view-creation time. Adding proud_of via ci.* shifts the
-- position of every column after it, so `create or replace` fails with
-- "cannot change name of view column" — drop and recreate it instead.
drop view if exists growth_check_in_scores;
create view growth_check_in_scores as
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
-- growth_tasks
-- Two purposes, distinguished by `kind`:
--  - 'weekly': the "small tasks this week" entered during a check-in,
--    tied to that check_in_id, shown on the new Home tab.
--  - 'daily': a free-standing to-do jotted directly on the Home tab
--    (laundry, dishes, etc.), not tied to any check-in.
-- No privacy split — both members' tasks are visible to both.
-- ---------------------------------------------------------
create table if not exists growth_tasks (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references growth_members(id) on delete cascade,
  kind text not null check (kind in ('weekly', 'daily')),
  check_in_id uuid references growth_check_ins(id) on delete cascade,
  task_text text not null,
  completed boolean not null default false,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists growth_tasks_member_idx on growth_tasks (member_id, kind, completed);
create index if not exists growth_tasks_check_in_idx on growth_tasks (check_in_id);

drop trigger if exists growth_tasks_set_updated_at on growth_tasks;
create trigger growth_tasks_set_updated_at
  before update on growth_tasks
  for each row execute function growth_set_updated_at();

alter table growth_tasks enable row level security;
drop policy if exists growth_tasks_all on growth_tasks;
create policy growth_tasks_all on growth_tasks
  for all using (true) with check (true);
