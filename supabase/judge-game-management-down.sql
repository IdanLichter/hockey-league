-- Rollback for judge-game-management.sql.
-- src/lib/api.js recalculateTeamStats() must be reverted to its client-side
-- loop at the same time, or the admin games tab will break.

drop policy if exists "Judge insert games"       on public.games;
drop policy if exists "Judge update games"       on public.games;
drop policy if exists "Judge delete games"       on public.games;
drop policy if exists "Judge insert game_stats"  on public.game_stats;
drop policy if exists "Judge update game_stats"  on public.game_stats;
drop policy if exists "Judge delete game_stats"  on public.game_stats;

drop function if exists public.recompute_all_team_standings();

-- Restore is_judge() to RPC-internal only. Safe once no policy references it.
revoke execute on function public.is_judge() from authenticated;
