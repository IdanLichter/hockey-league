-- The league table counts REGULAR-SEASON ('ליגה') games only.
--
-- It used to count everything except friendlies, so playoff games (פלייאוף) moved the
-- table after the regular season had ended — the table that decides the playoff seeding
-- kept changing during the playoffs it seeded. Player stats (goals etc.) still count
-- playoff games; only team standings are regular-season-only.
--
-- Safe to run any time: it only changes which games are summed. Archived seasons are
-- snapshots taken by close_season() and are not recomputed.

create or replace function public.recompute_team_standings(p_team uuid)
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
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
      and g.game_type = 'ליגה'
      and g.tournament_id is null
      and g.season_id = public.current_season_id()
      and g.home_score is not null and g.away_score is not null
      and (g.home_team_id = p_team or g.away_team_id = p_team)
  ) s
  where t.id = p_team;
$function$;
