-- Judges manage games from the admin console (משחקים tab).
-- Applied to production 2026-07-10 as migration `judge_game_management`.
--
-- A judge is a `user_roles` row with role='judge' (no team scope — judges are
-- league-wide). Hiding the tab is cosmetic; the policies below are the real gate.

-- An RLS policy expression runs as the CALLING role, so `authenticated` must be
-- able to execute is_judge(). It stays revoked from `anon`: the policies below
-- are INSERT/UPDATE/DELETE only, so an anonymous SELECT never evaluates them.
-- (The existing "Admin write games" policy is FOR ALL and therefore *does* get
-- evaluated on anonymous SELECT — do not copy that shape here.)
grant execute on function public.is_judge() to authenticated;

-- Additive PERMISSIVE policies, OR'd with the untouched "Admin write games"
-- (FOR ALL) and "Public read games".
create policy "Judge insert games" on public.games
  for insert with check (public.is_judge());
create policy "Judge update games" on public.games
  for update using (public.is_judge()) with check (public.is_judge());
create policy "Judge delete games" on public.games
  for delete using (public.is_judge());

-- The games tab's per-player stat editor rewrites these rows
-- (deleteGameStatsByGameId + createGameStat).
create policy "Judge insert game_stats" on public.game_stats
  for insert with check (public.is_judge());
create policy "Judge update game_stats" on public.game_stats
  for update using (public.is_judge()) with check (public.is_judge());
create policy "Judge delete game_stats" on public.game_stats
  for delete using (public.is_judge());

-- GamesAdmin recomputes standings after every game save and delete. Rather than
-- grant judges UPDATE on `teams` (which would also let them rename teams and
-- rewrite the standings table arbitrarily through the REST API), expose one
-- self-gated RPC that runs the existing per-team recompute across every team.
-- src/lib/api.js recalculateTeamStats() now calls this instead of looping
-- updateTeam() in the browser. Verified to reproduce all 7 teams' stored
-- standings exactly before it replaced the client-side math.
create or replace function public.recompute_all_team_standings()
returns void
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if not (public.is_admin() or public.is_judge()) then
    raise exception 'not authorized';
  end if;
  for t in select id from public.teams loop
    perform public.recompute_team_standings(t);
  end loop;
end;
$$;

revoke all on function public.recompute_all_team_standings() from public, anon;
grant execute on function public.recompute_all_team_standings() to authenticated;

-- NOTE: a judge deleting a game cascades to its game_stats rows. There is no
-- has-stats guard here (unlike the coach delete policy on players) because
-- judges are expected to fix up real fixtures. See supabase/coach-role.sql.
