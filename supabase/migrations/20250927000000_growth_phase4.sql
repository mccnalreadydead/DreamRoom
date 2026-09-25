-- =========================================================
-- DreamRoom "Personal Growth" add-on — Phase 4
-- Only touches the growth_* tables (our own feature tables).
-- Does NOT touch any sales/inventory/orders/calendar/receipts table.
-- Safe to run standalone in the Supabase SQL editor, AFTER phase 1-3.
--
-- Adds exactly-three-per-week habit/goal slots (entered as text during
-- a check-in) plus a per-day on-track/off-track log for each, so the
-- Home tab can show a Monday-Sunday row of dots per habit. Unlogged
-- days simply have no row — no assumed default.
-- =========================================================

create table if not exists growth_habits (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references growth_members(id) on delete cascade,
  check_in_id uuid not null references growth_check_ins(id) on delete cascade,
  habit_text text not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists growth_habits_check_in_idx on growth_habits (check_in_id);
create index if not exists growth_habits_member_idx on growth_habits (member_id);

create table if not exists growth_habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references growth_habits(id) on delete cascade,
  member_id uuid not null references growth_members(id) on delete cascade,
  log_date date not null,
  status text not null check (status in ('on', 'off')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint growth_habit_logs_unique unique (habit_id, log_date)
);

create index if not exists growth_habit_logs_habit_idx on growth_habit_logs (habit_id, log_date);

drop trigger if exists growth_habit_logs_set_updated_at on growth_habit_logs;
create trigger growth_habit_logs_set_updated_at
  before update on growth_habit_logs
  for each row execute function growth_set_updated_at();

alter table growth_habits enable row level security;
alter table growth_habit_logs enable row level security;

drop policy if exists growth_habits_all on growth_habits;
create policy growth_habits_all on growth_habits
  for all using (true) with check (true);

drop policy if exists growth_habit_logs_all on growth_habit_logs;
create policy growth_habit_logs_all on growth_habit_logs
  for all using (true) with check (true);
