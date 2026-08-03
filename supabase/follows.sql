-- follows.sql (P0 — 2026-08-02)
-- Applied to production via MCP as migration `follows`.
--
-- Subscribe / follow. Sheet row 24 (התראות למי שעשה סבסקריפשן לעמוד קבוצה) plus the
-- ranked-feed epic. One table serves both jobs, which is why `notify` is a per-row flag:
-- following a team ranks it up in your feed, but you only get pushed about its games if
-- you asked to be. Following is cheap; notifications are annoying.
--
-- Targets are teams and players (decided — not tournaments). target_id is intentionally
-- not a foreign key, since it points at one of two tables; the RPCs validate it.
--
-- The table and its policies land here in P0; the feed ranking and the follow buttons
-- are P5.

create table if not exists public.follows (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('team', 'player')),
  target_id   uuid not null,
  notify      boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (user_id, target_type, target_id)
);

create index if not exists follows_user_idx   on public.follows(user_id);
create index if not exists follows_target_idx on public.follows(target_type, target_id);
-- the notifier in P5 fans out from a target to its subscribers
create index if not exists follows_notify_idx on public.follows(target_type, target_id) where notify;

alter table public.follows enable row level security;

-- A follow list is the viewer's own business: own rows only. Public follower COUNTS
-- come from the definer RPC below, so a team page can show "12 עוקבים" without
-- exposing who those twelve are.
drop policy if exists "read own follows" on public.follows;
create policy "read own follows" on public.follows
  for select using (user_id = (select auth.uid()));

drop policy if exists "insert own follows" on public.follows;
create policy "insert own follows" on public.follows
  for insert with check (user_id = (select auth.uid()));

drop policy if exists "update own follows" on public.follows;
create policy "update own follows" on public.follows
  for update using (user_id = (select auth.uid()));

drop policy if exists "delete own follows" on public.follows;
create policy "delete own follows" on public.follows
  for delete using (user_id = (select auth.uid()));

-- Follower counts for a set of targets. Definer + counts only — never the follower ids.
create or replace function public.follower_counts(p_type text, p_ids uuid[])
returns table (target_id uuid, followers bigint)
language sql stable security definer set search_path = public as $$
  select f.target_id, count(*)::bigint
  from public.follows f
  where f.target_type = p_type and f.target_id = any(p_ids)
  group by f.target_id
$$;
grant execute on function public.follower_counts(text, uuid[]) to authenticated, anon;
