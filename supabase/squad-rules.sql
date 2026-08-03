-- squad-rules.sql (P1 — 2026-08-02)
-- Applied to production via MCP as migration `squad_rules`.
--
-- The registration rules from the test sheet:
--   row 5  שחקן שלא מצליח להרשם בגלל כרטיס אדום
--   row 6  שחקן מקבוצה אחרת לא יכול להרשם     ← was NOT enforced server-side
--   row 7  הרשמה ידנית של שוער בהשאלה
--   row 8  הרשמה ידנית של שחקן נוער חד פעמי
--   row 13 הוספה ידנית של שחקן לטופס
--   row 14 חוסר אפשרות להוסיף שחקן ידנית שאין לו בדיקה
--   row 15 חוסר אפשרות להוסיף שחקן עם כרטיס אדום
--   row 33 ולידאציה של גיל השחקן  (coach confirmation — see below)
--
-- On row 33: there is no birth date in the schema (players.age is an integer filled in
-- for 6 of 98 players), so "14 או כיתה ח, המוקדם מביניהם" cannot be computed. Per the
-- product decision the coach confirms it instead, and the confirmation is recorded on
-- the row so there is an audit trail of who vouched for the player.

alter table public.game_availability
  add column if not exists age_confirmed boolean not null default false;

-- ---------------------------------------------------------------------------
-- Self-registration. Extends availability-medical-gate.sql with the roster and
-- red-card checks.
-- ---------------------------------------------------------------------------
create or replace function public.set_game_availability(p_game_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_player uuid;
begin
  v_player := public.my_player_id();
  if v_player is null then raise exception 'no linked player'; end if;
  if p_status not in ('available','unavailable') then raise exception 'bad status'; end if;

  -- Row 6. The UI only shows the button on your own team's games, but this RPC is
  -- reachable directly with any game id, so the rule has to live here — previously it
  -- did not exist at all and any signed-in player could register for any game.
  -- player_teams is the roster source of truth for multi-age players; players.team_id
  -- is the derived primary. An existing row also qualifies, so a loaned player the
  -- coach added can still change his own answer.
  if not exists (
    select 1 from public.games g
    where g.id = p_game_id
      and (
        exists (select 1 from public.players p
                where p.id = v_player and p.team_id in (g.home_team_id, g.away_team_id))
        or exists (select 1 from public.player_teams pt
                where pt.player_id = v_player and pt.team_id in (g.home_team_id, g.away_team_id))
        or exists (select 1 from public.game_availability ga
                where ga.game_id = p_game_id and ga.player_id = v_player)
      )
  ) then
    raise exception 'not in this game';
  end if;

  if p_status = 'available' then
    -- Row 5: a red card blocks the next game.
    if public.is_suspended(v_player) then
      raise exception 'suspended';
    end if;
    -- B5: no signup without a valid medical (availability-medical-gate.sql).
    if not exists (
      select 1 from public.medical_certificates
      where player_id = v_player and status = 'approved'
        and (expires_at is null or expires_at >= current_date)
    ) then
      raise exception 'no valid medical';
    end if;
  end if;

  insert into public.game_availability (game_id, player_id, status, updated_at)
    values (p_game_id, v_player, p_status, now())
    on conflict (game_id, player_id) do update
      set status = excluded.status, updated_at = now();
end;
$$;
revoke all on function public.set_game_availability(uuid, text) from public, anon;
grant execute on function public.set_game_availability(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Manual squad add (rows 7, 8, 13–15, 33).
-- Coach of that team BEFORE kick-off; judge / league manager / admin at any time
-- (the judge owns the sheet once the game is running).
-- ---------------------------------------------------------------------------
create or replace function public.add_player_to_squad(
  p_game_id       uuid,
  p_player_id     uuid,
  p_team_id       uuid,
  p_note          text    default null,
  p_age_confirmed boolean default false
) returns void language plpgsql security definer set search_path = public as $$
declare
  g record;
  v_not_started boolean;
begin
  select id, home_team_id, away_team_id, game_date, status
    into g from public.games where id = p_game_id;
  if g.id is null then raise exception 'game not found'; end if;

  -- The team must actually be in this game, and it is required: a loaned goalkeeper is
  -- on neither roster, so nothing else says which side he is turning out for.
  if p_team_id is null or p_team_id not in (g.home_team_id, g.away_team_id) then
    raise exception 'team not in this game';
  end if;

  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'player not found';
  end if;

  v_not_started := (g.game_date > now()) and (g.status in ('scheduled', 'postponed'));

  if public.is_admin() or public.is_league_manager() or public.is_judge() then
    null;                                        -- officials may add at any time
  elsif public.is_coach_of(p_team_id) then
    if not v_not_started then raise exception 'game already started'; end if;
  else
    raise exception 'not authorized';
  end if;

  -- Row 33 — the coach vouches for eligibility; the database cannot.
  if not p_age_confirmed then
    raise exception 'age not confirmed';
  end if;

  -- Row 15
  if public.is_suspended(p_player_id) then
    raise exception 'suspended';
  end if;

  -- Row 14
  if not exists (
    select 1 from public.medical_certificates
    where player_id = p_player_id and status = 'approved'
      and (expires_at is null or expires_at >= current_date)
  ) then
    raise exception 'no valid medical';
  end if;

  insert into public.game_availability
    (game_id, player_id, status, added_by, team_id, note, age_confirmed, updated_at)
  values
    (p_game_id, p_player_id, 'available', (select auth.uid()), p_team_id,
     nullif(btrim(coalesce(p_note, '')), ''), true, now())
  on conflict (game_id, player_id) do update
    set status        = 'available',
        added_by      = excluded.added_by,
        team_id       = excluded.team_id,
        note          = excluded.note,
        age_confirmed = true,
        updated_at    = now();
end;
$$;
revoke all on function public.add_player_to_squad(uuid, uuid, uuid, text, boolean) from public, anon;
grant execute on function public.add_player_to_squad(uuid, uuid, uuid, text, boolean) to authenticated;

-- Remove a manually added player. Deliberately scoped to added_by is not null: a coach
-- may undo his own addition, but must never be able to delete a player's own answer.
create or replace function public.remove_player_from_squad(p_game_id uuid, p_player_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  g record;
  v_row record;
  v_not_started boolean;
begin
  select id, game_date, status into g from public.games where id = p_game_id;
  if g.id is null then raise exception 'game not found'; end if;

  select team_id, added_by into v_row
    from public.game_availability
   where game_id = p_game_id and player_id = p_player_id;
  if v_row is null or v_row.added_by is null then
    raise exception 'not a manual entry';
  end if;

  v_not_started := (g.game_date > now()) and (g.status in ('scheduled', 'postponed'));

  if public.is_admin() or public.is_league_manager() or public.is_judge() then
    null;
  elsif v_row.team_id is not null and public.is_coach_of(v_row.team_id) then
    if not v_not_started then raise exception 'game already started'; end if;
  else
    raise exception 'not authorized';
  end if;

  delete from public.game_availability
   where game_id = p_game_id and player_id = p_player_id and added_by is not null;
end;
$$;
revoke all on function public.remove_player_from_squad(uuid, uuid) from public, anon;
grant execute on function public.remove_player_from_squad(uuid, uuid) to authenticated;

-- The squad for a game as the coach/judge needs to see it: roster players who answered
-- plus manually added players (who are on neither roster, so a plain players-by-team
-- query cannot find them). Definer because a judge cannot read game_availability via RLS.
create or replace function public.game_squad(p_game_id uuid)
returns table (
  player_id uuid, first_name text, last_name text, "position" text,
  team_id uuid, status text, added_by uuid, note text, is_manual boolean, suspended boolean
) language plpgsql stable security definer set search_path = public as $$
declare g record;
begin
  select home_team_id, away_team_id into g from public.games where id = p_game_id;
  if not found then return; end if;

  if not (
    public.is_admin() or public.is_league_manager() or public.is_judge()
    or public.is_coach_of(g.home_team_id) or public.is_coach_of(g.away_team_id)
  ) then
    raise exception 'not authorized';
  end if;

  return query
    select ga.player_id, p.first_name, p.last_name, p."position",
           coalesce(ga.team_id, p.team_id) as team_id,
           ga.status, ga.added_by, ga.note,
           (ga.added_by is not null) as is_manual,
           public.is_suspended(ga.player_id) as suspended
    from public.game_availability ga
    join public.players p on p.id = ga.player_id
    where ga.game_id = p_game_id
    order by coalesce(ga.team_id, p.team_id), ga.status, p.last_name, p.first_name;
end;
$$;
revoke all on function public.game_squad(uuid) from public, anon;
grant execute on function public.game_squad(uuid) to authenticated;
