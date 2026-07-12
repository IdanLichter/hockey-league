-- Friendly ('ידידותי') game type.
--
-- A friendly game is content-only: it shows on the judge list, runs live, and
-- appears in the feed (result + highlight posts), but it must NEVER count toward
-- the competitive record — standings, player/team totals, or the Statistics page.
-- The client mirrors this rule via `countsForStats()` in src/lib/leagueStats.js;
-- this migration enforces the standings half server-side.
--
-- Both changes are additive/no-op on existing data: no game currently carries the
-- new type, so recompute output is byte-identical until a friendly is created.

-- 1) Allow the new value on games.game_type (previously the 3 official types only).
alter table public.games drop constraint if exists games_game_type_check;
alter table public.games add constraint games_game_type_check
  CHECK ((game_type = ANY (ARRAY['ליגה'::text, 'פלייאוף'::text, 'Final Four'::text, 'ידידותי'::text])));

-- 2) Exclude friendlies from the standings aggregation. This is the single root
--    of every standings surface: recompute_all_team_standings loops it, and
--    judge_save_game_result / GamesAdmin call it after each result. Fixing it
--    here also keeps the season archive snapshot clean (it copies the stored
--    teams.* columns this function produces).
CREATE OR REPLACE FUNCTION public.recompute_team_standings(p_team uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.teams t set
    wins          = s.wins,
    losses        = s.losses,
    ties          = s.ties,
    points        = s.wins * 3 + s.ties,
    goals_for     = s.gf,
    goals_against = s.ga
  from (
    select
      count(*) filter (where (g.home_team_id = p_team and g.home_score > g.away_score)
                          or (g.away_team_id = p_team and g.away_score > g.home_score)) as wins,
      count(*) filter (where (g.home_team_id = p_team and g.home_score < g.away_score)
                          or (g.away_team_id = p_team and g.away_score < g.home_score)) as losses,
      count(*) filter (where g.home_score = g.away_score)                               as ties,
      coalesce(sum(case when g.home_team_id = p_team then g.home_score else g.away_score end), 0) as gf,
      coalesce(sum(case when g.home_team_id = p_team then g.away_score else g.home_score end), 0) as ga
    from public.games g
    where g.status = 'completed'
      and g.game_type <> 'ידידותי'
      and g.home_score is not null and g.away_score is not null
      and (g.home_team_id = p_team or g.away_team_id = p_team)
  ) s
  where t.id = p_team;
$function$
;
