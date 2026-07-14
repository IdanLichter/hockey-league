-- manager-tournament-games.sql  (Package 3)
-- Applied to production 2026-07-14 via MCP as migration `manager_writes_tournament_games`.
--
-- The tournament schedule generator (ScheduleGenerator.jsx) lets a league-manager
-- create games for a tournament. games RLS was admin-only, so this adds a policy
-- letting a league-manager write games that belong to a tournament (tournament_id
-- not null). It never touches senior-league games (tournament_id null); admins
-- keep full access via the existing "Admin write games" policy.

drop policy if exists "Manager writes tournament games" on public.games;
create policy "Manager writes tournament games" on public.games
  for all
  using (public.is_league_manager() and tournament_id is not null)
  with check (public.is_league_manager() and tournament_id is not null);
