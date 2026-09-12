-- Statistics (and every other public page) showed LAST season's numbers to
-- admins and league managers.
--
-- Season scoping lives entirely in RLS: no page filters by season_id, they all
-- just `select * from games` / `game_stats` and let the restrictive policy do
-- the work. That policy exempts admins and league managers outright, so for
-- those two roles the pages aggregate EVERY season ever played. After the
-- 2025-26 rollover that meant 51 completed games + 615 box-score rows from the
-- closed season, rendered under a "2026-27" heading. Anonymous visitors were
-- always correct (they saw nothing, because 2026-27 has no games yet).
--
-- The exemption still has a real job: it is what lets a league manager draft
-- next season's fixtures in a 'planned' season before the current one closes.
-- So narrow it instead of removing it — admins and LMs keep full access to the
-- active and planned seasons, and ARCHIVED seasons drop out of the live tables
-- for everyone.
--
-- Nothing is lost: closed seasons are read through the snapshot tables
-- (team_season_stats / player_season_stats) and the SECURITY DEFINER
-- season_games_detail() RPC, which is exactly what /archive already uses.

drop policy if exists "games current season only" on public.games;
create policy "games current season only" on public.games
  as restrictive for select using (
    season_id = public.current_season_id()
    or tournament_id is not null          -- tournaments run on their own timeline
    or (
      (public.is_admin() or public.is_league_manager())
      and exists (
        select 1 from public.seasons s
        where s.id = games.season_id
          and s.status in ('active', 'planned')
      )
    )
  );

drop policy if exists "game stats current season only" on public.game_stats;
create policy "game stats current season only" on public.game_stats
  as restrictive for select using (
    exists (
      select 1 from public.games g
      where g.id = game_stats.game_id
        and (
          g.season_id = public.current_season_id()
          or g.tournament_id is not null
          or (
            (public.is_admin() or public.is_league_manager())
            and exists (
              select 1 from public.seasons s
              where s.id = g.season_id
                and s.status in ('active', 'planned')
            )
          )
        )
    )
  );
