-- tournament-team-invitations.sql  (Package 2)
-- Applied to production 2026-07-14 via MCP as migration `tournament_team_invitations`.
--
-- A tournament manager (league-manager/admin) invites a team; the team's coach
-- accepts/declines. Accepted teams are the tournament's participants (shown on the
-- tournament page). Games remain tagged with tournament_id separately (schedule
-- generation is Package 3). Managed from the tournament page (TournamentDetail).

create table if not exists public.tournament_teams (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  team_id       uuid not null references public.teams(id) on delete cascade,
  status        text not null default 'invited' check (status in ('invited','accepted','declined')),
  invited_by    uuid,
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  unique (tournament_id, team_id)
);

alter table public.tournament_teams enable row level security;
create policy "Read accepted participants or involved" on public.tournament_teams
  for select using (
    status = 'accepted' or public.is_admin() or public.is_league_manager() or public.is_coach_of(team_id)
  );
create policy "Manager manages invites" on public.tournament_teams
  for all using (public.is_admin() or public.is_league_manager())
  with check (public.is_admin() or public.is_league_manager());
create policy "Coach responds to own-team invite" on public.tournament_teams
  for update using (public.is_coach_of(team_id)) with check (public.is_coach_of(team_id));

-- invite_team_to_tournament (manager) / respond_tournament_invite (coach) RPCs —
-- see the applied migration body for the full definitions.
