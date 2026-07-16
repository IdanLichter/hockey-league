-- C1: same-team attendance visibility (2026-07-16). Applied to prod via MCP migration
-- `availability_same_team_read`. A rostered player may read the availability of players
-- on their OWN team (teammates see who's coming) — never the opponent's. Extends the
-- self/coach/admin read policy from game-availability.sql.
drop policy if exists "read availability self/coach/admin" on public.game_availability;
create policy "read availability self/team/coach/admin" on public.game_availability
  for select using (
    player_id = public.my_player_id()
    or public.is_admin()
    or exists (select 1 from public.players pl
               where pl.id = game_availability.player_id and public.is_coach_of(pl.team_id))
    or exists (
      select 1 from public.players me, public.players them
      where me.id = public.my_player_id()
        and them.id = game_availability.player_id
        and me.team_id is not null
        and me.team_id = them.team_id
    )
  );
