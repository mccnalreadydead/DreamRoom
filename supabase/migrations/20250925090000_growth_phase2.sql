-- =========================================================
-- DreamRoom "Personal Growth" add-on — Phase 2
-- Only touches the growth_* tables created in Phase 1 (our own
-- feature tables). Does NOT touch any sales/inventory/orders/
-- calendar/receipts table. Safe to run standalone in the Supabase
-- SQL editor, AFTER phase 1.
--
-- ⚠️ Data-loss note: this drops note_physical/note_mental/
-- note_time_energy/note_relationships/note_habits/note_work_money/
-- proud_of/adjustments from growth_check_ins, per the new retention
-- rule (only pillar scores + two specific text fields are kept
-- forever; every other written field is used in the moment and
-- never persisted). Any existing values in those columns are
-- permanently deleted when this runs.
-- =========================================================

-- ---------------------------------------------------------
-- growth_check_ins: retention rework
-- Keep forever: the 6 pillar scores, goal_followthrough, overall_score
-- (view). Keep forever, capped at 600 chars: pain_note ("body pain
-- note") and life_reflection ("how's life going" reflection). Every
-- other written field (per-pillar notes, proud_of, adjustments) is
-- part of the in-the-moment reflection prompt only and is never
-- persisted — the app simply doesn't send those to the database.
-- ---------------------------------------------------------
alter table growth_check_ins add column if not exists pain_note text;
alter table growth_check_ins add column if not exists life_reflection text;

-- Preserve any existing "reflection" text as a starting point for the
-- renamed life_reflection field before dropping the old column.
update growth_check_ins
set life_reflection = reflection
where life_reflection is null and reflection is not null;

-- growth_check_in_scores selects ci.* and therefore depends on every
-- column below being dropped. Drop it first; it's recreated later in
-- this same file with the new column set.
drop view if exists growth_check_in_scores;

alter table growth_check_ins
  drop column if exists note_physical,
  drop column if exists note_mental,
  drop column if exists note_time_energy,
  drop column if exists note_relationships,
  drop column if exists note_habits,
  drop column if exists note_work_money,
  drop column if exists proud_of,
  drop column if exists adjustments,
  drop column if exists reflection;

alter table growth_check_ins
  drop constraint if exists growth_check_ins_pain_note_len,
  add constraint growth_check_ins_pain_note_len
    check (pain_note is null or char_length(pain_note) <= 600);

alter table growth_check_ins
  drop constraint if exists growth_check_ins_life_reflection_len,
  add constraint growth_check_ins_life_reflection_len
    check (life_reflection is null or char_length(life_reflection) <= 600);

-- ---------------------------------------------------------
-- growth_pain_log
-- Standalone, always-available body pain log — independent of the
-- weekly check-in. Each entry tracks one issue by location + start
-- date, and can be marked resolved (moves it into a collapsed
-- "past issues" section in the UI).
-- ---------------------------------------------------------
create table if not exists growth_pain_log (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references growth_members(id) on delete cascade,
  location text not null,
  start_date date not null default current_date,
  notes text,
  resolved boolean not null default false,
  resolved_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint growth_pain_log_notes_len check (notes is null or char_length(notes) <= 600)
);

create index if not exists growth_pain_log_member_idx
  on growth_pain_log (member_id, resolved, start_date);

drop trigger if exists growth_pain_log_set_updated_at on growth_pain_log;
create trigger growth_pain_log_set_updated_at
  before update on growth_pain_log
  for each row execute function growth_set_updated_at();

-- ---------------------------------------------------------
-- growth_long_term_goals
-- One persistent free-form text box per member, shown on the
-- Pillars page, unrelated to the weekly check-in flow.
-- ---------------------------------------------------------
create table if not exists growth_long_term_goals (
  member_id uuid primary key references growth_members(id) on delete cascade,
  content text,
  updated_at timestamptz not null default now(),
  constraint growth_long_term_goals_len check (content is null or char_length(content) <= 4000)
);

drop trigger if exists growth_long_term_goals_set_updated_at on growth_long_term_goals;
create trigger growth_long_term_goals_set_updated_at
  before update on growth_long_term_goals
  for each row execute function growth_set_updated_at();

-- ---------------------------------------------------------
-- Row Level Security
-- Same intentionally-permissive model as Phase 1 (no per-user auth
-- in this app yet — see growth_members comment in the phase 1
-- migration). No privacy split between Devan and Chad: both can see
-- all scores, the pain log, and the goals box.
-- ---------------------------------------------------------
alter table growth_pain_log enable row level security;
alter table growth_long_term_goals enable row level security;

drop policy if exists growth_pain_log_all on growth_pain_log;
create policy growth_pain_log_all on growth_pain_log
  for all using (true) with check (true);

drop policy if exists growth_long_term_goals_all on growth_long_term_goals;
create policy growth_long_term_goals_all on growth_long_term_goals
  for all using (true) with check (true);
