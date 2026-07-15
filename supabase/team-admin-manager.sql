-- team-admin-manager.sql
-- ---------------------------------------------------------------------------
-- Two changes so a league-manager gets full team management on /admin, and so
-- deleting a team can never silently wipe match history:
--
-- 1. "Manager write teams" — league-managers may insert/update/delete teams
--    (previously admin-only via "Admin write teams"). This lets the admin Teams
--    tab work for managers unchanged: list + add + edit + delete every team.
--
-- 2. guard_team_delete() BEFORE DELETE trigger — blocks deleting a team that
--    still has games. teams→games FK is ON DELETE CASCADE, so without this a
--    delete would also erase every game the team played (and its game_stats),
--    corrupting other teams' standings. The trigger protects EVERYONE (admins
--    too), matching the app's "remove its games first" delete rule.
-- ---------------------------------------------------------------------------

drop policy if exists "Manager write teams" on public.teams;
create policy "Manager write teams" on public.teams
  for all
  using (public.is_league_manager())
  with check (public.is_league_manager());

create or replace function public.guard_team_delete() returns trigger
language plpgsql set search_path = public as $$
declare v_games int;
begin
  select count(*) into v_games
    from public.games
    where home_team_id = OLD.id or away_team_id = OLD.id;
  if v_games > 0 then
    raise exception 'cannot delete a team with % game(s); remove or reassign its games first', v_games
      using errcode = 'restrict_violation';
  end if;
  return OLD;
end; $$;

drop trigger if exists trg_guard_team_delete on public.teams;
create trigger trg_guard_team_delete
  before delete on public.teams
  for each row execute function public.guard_team_delete();
