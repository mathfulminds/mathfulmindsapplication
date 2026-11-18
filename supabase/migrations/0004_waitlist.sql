-- =========================================
-- 0004_waitlist.sql
-- =========================================

-- Beta waitlist sign-ups from /waitlist (written by POST /api/waitlist).
create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;

-- Anyone (including signed-out visitors) may add themselves; nobody can read
-- the list through the public API - view it from the Supabase dashboard.
create policy "waitlist_insert_anyone"
  on public.waitlist for insert
  to anon, authenticated
  with check (true);
