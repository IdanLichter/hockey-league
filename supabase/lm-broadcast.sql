-- lm-broadcast.sql (P4 — 2026-08-02)
-- Applied to production via MCP as migrations `game_audience_and_broadcast` and
-- `notify_game_moved`.
--
--   row 25 התראות של מנהל הליגה ישירות לשחקנים על כל מה שצריך
--          (למשל: המשחק עשוי לעבור לביאליק בגלל גשם)
--   row 26 מנהל הליגה משנה את מיקום המשחק בגלל גשם וזה משגר הודעה אוטומטית לשחקנים
--
-- Row 25 is the manual case ("it MIGHT move") and row 26 the automatic one ("it HAS
-- moved"). Both address the same set of people, so both go through game_audience().

-- Everyone with a stake in this game: rostered players of either team (players.team_id
-- or player_teams, for multi-age), anyone manually added to the squad — a loaned
-- goalkeeper needs to know the venue changed just as much as a regular — and the two
-- teams' coaches. Only people with a linked account can be reached at all.
--
-- Coaches are a deliberate addition beyond "the players of one game": a venue change
-- nobody told the coach about is a coach turning up at the wrong rink. Say so if you
-- want it narrowed to players only.
create or replace function public.game_audience(p_game uuid)
returns table (user_id uuid) language sql stable security definer set search_path = public as $$
  select distinct pr.id
  from public.profiles pr
  join public.players p on p.id = pr.player_id
  join public.games  g on g.id = p_game
  where p.team_id in (g.home_team_id, g.away_team_id)
     or exists (select 1 from public.player_teams pt
                where pt.player_id = p.id and pt.team_id in (g.home_team_id, g.away_team_id))
     or exists (select 1 from public.game_availability ga
                where ga.game_id = g.id and ga.player_id = p.id)
  union
  select ur.user_id
  from public.user_roles ur
  join public.games g on g.id = p_game
  where ur.role = 'coach' and ur.team_id in (g.home_team_id, g.away_team_id)
$$;
revoke all on function public.game_audience(uuid) from public, anon;
grant execute on function public.game_audience(uuid) to authenticated;

-- Row 25: the league manager writes to everyone involved in one game.
create or replace function public.broadcast_to_game(p_game_id uuid, p_message text)
returns int language plpgsql security definer set search_path = public as $$
declare
  g   record;
  rec record;
  msg text := nullif(btrim(coalesce(p_message, '')), '');
  n   int := 0;
begin
  if not (public.is_admin() or public.is_league_manager()) then
    raise exception 'not authorized';
  end if;
  if msg is null then raise exception 'message is required'; end if;
  if length(msg) > 500 then raise exception 'message too long'; end if;

  select gm.id, gm.game_date, th.name as home_name, ta.name as away_name
    into g
    from public.games gm
    left join public.teams th on th.id = gm.home_team_id
    left join public.teams ta on ta.id = gm.away_team_id
   where gm.id = p_game_id;
  if not found then raise exception 'game not found'; end if;

  for rec in select user_id from public.game_audience(p_game_id) loop
    -- never notify the manager about his own message
    if rec.user_id is distinct from (select auth.uid()) then
      perform public.create_notification(
        rec.user_id, 'lm_broadcast', (select auth.uid()), 'game', p_game_id::text,
        jsonb_build_object('message', msg,
                           'home_team', coalesce(g.home_name, ''),
                           'away_team', coalesce(g.away_name, '')));
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;
revoke all on function public.broadcast_to_game(uuid, text) from public, anon;
grant execute on function public.broadcast_to_game(uuid, text) to authenticated;

-- Row 26: the venue or kick-off time actually changed → tell everyone, automatically,
-- whoever made the change and by whatever route (admin edit, an approved coach request,
-- or a direct fix). Best-effort: a failure here must never roll back the edit itself.
create or replace function public.notify_game_moved()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_what text;
  v_home text; v_away text;
  rec record;
begin
  if new.status = 'completed' then return null; end if;

  if new.venue is distinct from old.venue and new.game_date is distinct from old.game_date then
    v_what := 'both';
  elsif new.venue is distinct from old.venue then
    v_what := 'venue';
  elsif new.game_date is distinct from old.game_date then
    v_what := 'time';
  else
    return null;
  end if;

  select name into v_home from public.teams where id = new.home_team_id;
  select name into v_away from public.teams where id = new.away_team_id;

  for rec in select user_id from public.game_audience(new.id) loop
    perform public.create_notification(
      rec.user_id, 'game_moved', null, 'game', new.id::text,
      jsonb_build_object(
        'what', v_what,
        'home_team', coalesce(v_home, ''), 'away_team', coalesce(v_away, ''),
        'venue', new.venue, 'old_venue', old.venue,
        'game_date', new.game_date, 'old_game_date', old.game_date));
  end loop;
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists trg_notify_game_moved on public.games;
create trigger trg_notify_game_moved
  after update of venue, game_date on public.games
  for each row execute function public.notify_game_moved();
