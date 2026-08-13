-- Officials on a game, by name, for the game-form export.
--
-- The export writes the שופט / חובש lines of the official sheet, so it needs the
-- names of whoever was assigned or approved to work the game. `game_officials` is
-- readable only by admin / league manager / the official themselves, which leaves
-- out the two roles that actually export a sheet — the judge who ran the game and
-- the coaches of the two teams. This definer RPC opens exactly that set, and only
-- role + display name, never user ids or contact details.
--
-- The gate mirrors public.game_squad's, with one difference that matters:
-- `is_admin()` returns NULL (not false) for a session with no email claim, and
-- `if not (NULL or false)` is `if NULL`, which does NOT branch — a bare `not (...)`
-- would skip the whole check and hand the rows to anyone. coalesce makes it false.

create or replace function public.game_report_officials(p_game_id uuid)
returns table (role text, name text, status text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare g record;
begin
  select home_team_id, away_team_id into g from public.games where id = p_game_id;
  if not found then return; end if;

  if not coalesce(
       public.is_admin() or public.is_league_manager() or public.is_judge()
       or public.is_coach_of(g.home_team_id) or public.is_coach_of(g.away_team_id),
       false) then
    raise exception 'not authorized';
  end if;

  return query
    select o.role,
           coalesce(nullif(btrim(p.display_name), ''), '')::text as name,
           o.status
      from public.game_officials o
      join public.profiles p on p.id = o.user_id
     where o.game_id = p_game_id
       -- 'applied' is a request nobody approved and 'rejected' is a refusal; neither
       -- belongs on a filed match sheet.
       and o.status in ('assigned', 'approved')
     order by o.role, o.created_at;
end;
$$;

revoke all on function public.game_report_officials(uuid) from public, anon;
grant execute on function public.game_report_officials(uuid) to authenticated;
