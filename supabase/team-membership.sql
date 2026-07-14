-- team-membership.sql  (Package 1b)
-- Applied to production 2026-07-14 via MCP as migration `team_membership`.
--
-- Self-service team membership. A linked player requests to join a team
-- (request_team_join) → the team coach/admin approves (approve_team_join), which
-- sets players.team_id and refreshes the team-scoped 'player' role. leave_team()
-- makes the player a free agent (team_id null). Free-agent player cards:
-- player_submissions.team_id becomes optional, approved by admin/league-manager
-- (a teamless card has no coach). guard_profile_player_id() amended so a
-- league-manager may link a profile (needed to approve a free-agent card).
--
-- See the applied migration for the full body (team_join_requests table + RLS,
-- request/approve/reject/leave RPCs, the nullable player_submissions.team_id, and
-- the updated guard_profile_player_id + approve_player_submission).

create table if not exists public.team_join_requests (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.players(id) on delete cascade,
  team_id     uuid not null references public.teams(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  note        text,
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid
);
create unique index if not exists team_join_requests_one_pending_per_player
  on public.team_join_requests(player_id) where status = 'pending';
alter table public.team_join_requests enable row level security;
create policy "User inserts own pending join" on public.team_join_requests
  for insert with check (profile_id = auth.uid() and status = 'pending');
create policy "Read own joins or admin" on public.team_join_requests
  for select using (profile_id = auth.uid() or public.is_admin());
create policy "Coach reads own-team joins" on public.team_join_requests
  for select using (public.is_coach_of(team_id));
create policy "User cancels own pending join" on public.team_join_requests
  for delete using ((profile_id = auth.uid() and status = 'pending') or public.is_admin());

-- request_team_join / approve_team_join / reject_team_join / leave_team RPCs and
-- the free-agent changes (player_submissions.team_id nullable, guard +
-- approve_player_submission gating on team presence) — see migration body.
alter table public.player_submissions alter column team_id drop not null;
