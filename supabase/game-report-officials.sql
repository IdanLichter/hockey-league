-- Named people attached to a game, for the game-form export.
--
-- The export writes the שופט / שופט נוסף / חובש / מאמן lines of the official sheet, so
-- it needs the names of everyone the league already has on record for the fixture:
-- the officials assigned to work it, and the coaches of the two teams. Neither table
-- is readable by the people who actually export a sheet — `game_officials` is
-- admin / league manager / self, and `user_roles` is read-own-only — so this definer
-- RPC opens exactly that set, returning role + display name + team, never user ids or
-- contact details.
--
-- The gate mirrors public.game_squad's, with one difference that matters:
-- `is_admin()` returns NULL (not false) for a session with no email claim, and
-- `if not (NULL or false)` is `if NULL`, which does NOT branch — a bare `not (...)`
-- would skip the whole check and hand the rows to anyone. coalesce makes it false.

create or replace function public.game_report_officials(p_game_id uuid)
returns table (role text, name text, status text, team_id uuid, player_id uuid)
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
    -- Officials assigned to work THIS game. 'applied' is a request nobody approved and
    -- 'rejected' is a refusal; neither belongs on a filed match sheet.
    select o.role,
           coalesce(nullif(btrim(p.display_name), ''), '')::text,
           o.status,
           null::uuid,
           -- Lets the caller tell an assigned judge apart from games.referee_id, which
           -- names a PLAYER (or an external referee), not an account.
           p.player_id
      from public.game_officials o
      join public.profiles p on p.id = o.user_id
     where o.game_id = p_game_id
       and o.status in ('assigned', 'approved')

    union all

    -- Coaches of the two teams. A team may have several accounts holding the role
    -- (assistant coaches, a manager who also coaches) — all are returned, oldest
    -- first, and the caller decides which to offer as the default.
    select 'coach',
           coalesce(nullif(btrim(p.display_name), ''), '')::text,
           'active',
           ur.team_id,
           p.player_id
      from public.user_roles ur
      join public.profiles p on p.id = ur.user_id
     where ur.role = 'coach'
       and ur.team_id in (g.home_team_id, g.away_team_id)
       and coalesce(nullif(btrim(p.display_name), ''), '') <> ''
     order by 1, 3, 2;
end;
$$;

revoke all on function public.game_report_officials(uuid) from public, anon;
grant execute on function public.game_report_officials(uuid) to authenticated;
