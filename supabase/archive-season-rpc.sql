-- ============================================================================
-- archive_and_reset_season: the season rollover, done atomically.
--
-- Replaces ~90 un-batched browser writes (api.js archiveAndResetSeason) that had
-- no transaction: a mid-way failure between "delete all games" and "reset stats"
-- permanently corrupted the season. This runs the whole thing in one plpgsql
-- transaction — any error rolls the ENTIRE operation back. Admin-only.
-- ============================================================================

create or replace function public.archive_and_reset_season(p_season_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_season uuid;
begin
  if not public.is_admin() then raise exception 'not authorized to archive the season'; end if;
  if coalesce(btrim(p_season_name), '') = '' then raise exception 'season name required'; end if;

  insert into archived_seasons(name) values (btrim(p_season_name)) returning id into v_season;

  -- team standings, ranked points -> GD -> GF (matches standingsComparator)
  insert into archived_team_standings(season_id, team_id, team_name, wins, losses, ties, points, goals_for, goals_against, own_goals_received, final_rank)
  select v_season, t.id, t.name, coalesce(t.wins,0), coalesce(t.losses,0), coalesce(t.ties,0), coalesce(t.points,0),
         coalesce(t.goals_for,0), coalesce(t.goals_against,0), coalesce(t.own_goals_received,0),
         row_number() over (order by coalesce(t.points,0) desc,
                                     (coalesce(t.goals_for,0) - coalesce(t.goals_against,0)) desc,
                                     coalesce(t.goals_for,0) desc)
  from teams t;

  -- player season totals
  insert into archived_player_stats(season_id, player_id, player_first_name, player_last_name, team_id, team_name, position, goals, games_played, blue_cards, red_cards, is_core, is_referee)
  select v_season, p.id, p.first_name, p.last_name, p.team_id, coalesce(tm.name,''), p.position,
         coalesce(p.goals,0), coalesce(p.games_played,0), coalesce(p.blue_cards,0), coalesce(p.red_cards,0),
         coalesce(p.is_core,false), coalesce(p.is_referee,false)
  from players p left join teams tm on tm.id = p.team_id;

  -- games (keep original_game_id so per-game stats can be mapped below)
  insert into archived_games(season_id, original_game_id, home_team_name, away_team_name, home_team_id, away_team_id, game_date, venue, home_score, away_score, status, game_type, playoff_round, series_game)
  select v_season, g.id, coalesce(ht.name,''), coalesce(at.name,''), g.home_team_id, g.away_team_id,
         g.game_date, g.venue, g.home_score, g.away_score, g.status, g.game_type, g.playoff_round, g.series_game
  from games g left join teams ht on ht.id = g.home_team_id left join teams at on at.id = g.away_team_id;

  -- per-game box scores, mapped to the archived_game row via original_game_id
  insert into archived_game_stats(season_id, archived_game_id, player_first_name, player_last_name, team_name, goals, blue_cards, red_cards, clean_sheet)
  select v_season, ag.id,
         coalesce(p.first_name, gs.guest_player_name, ''), coalesce(p.last_name, ''),
         coalesce(tm.name, ''), coalesce(gs.goals,0), coalesce(gs.blue_cards,0), coalesce(gs.red_cards,0), coalesce(gs.clean_sheet,false)
  from game_stats gs
  join archived_games ag on ag.original_game_id = gs.game_id and ag.season_id = v_season
  left join players p on p.id = gs.player_id
  left join teams tm on tm.id = p.team_id;

  -- wipe the live season
  delete from game_stats;
  delete from games;
  update teams  set wins=0, losses=0, ties=0, points=0, goals_for=0, goals_against=0, own_goals_received=0;
  update players set goals=0, games_played=0, blue_cards=0, red_cards=0;

  insert into league_settings(key, value, updated_at) values ('season_mode','regular', now())
    on conflict (key) do update set value='regular', updated_at=now();

  return v_season;
end $$;

revoke all    on function public.archive_and_reset_season(text) from public, anon;
grant  execute on function public.archive_and_reset_season(text) to authenticated;

-- Bonus: fix a corrupted stored DEFAULT on games.game_type (bytes for 'ליג'+U+FFFD
-- instead of 'ליגה'); it would fail the games_game_type_check if ever used.
alter table public.games alter column game_type set default 'ליגה'::text;
