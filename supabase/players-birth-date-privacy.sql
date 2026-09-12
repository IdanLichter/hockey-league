-- players-birth-date-privacy.sql (A1 + A4b — 2026-09-12)
-- Applied to production via MCP as migrations:
--   `revoke_players_birth_date_from_anon`
--   `set_player_birth_date_player_teams_branch`
--
-- This file also carries the CURRENT body of set_player_birth_date, which until now had
-- no repo file at all — it existed only in the deployed database.

-- ---------------------------------------------------------------------------
-- A1 — minors' dates of birth were readable by anyone.
--
-- `Public read players` is USING (true) and `anon` held a TABLE-level SELECT on
-- public.players, so GET /rest/v1/players?select=birth_date returned every DOB on file,
-- four of them belonging to children. RLS cannot fix this: the ROW is legitimately
-- public, it is one COLUMN that must not be.
--
-- A bare `REVOKE SELECT (birth_date)` is a NO-OP — Postgres keeps the table-level grant,
-- which covers every column. The table-level privilege has to go, and the remaining
-- columns be re-granted individually.
--
-- ORDERING MATTERS. Every client select had to be made explicit FIRST, because
-- `select *` asks for privilege on every column and would now 403 the whole public
-- player list for logged-out visitors:
--   web      src/lib/api.js  getPlayers()  → PLAYER_PUBLIC_COLUMNS (was select('*'))
--   iOS      SupabaseLeagueProvider.players() / roster()  → already explicit
--   Android  LeagueRepository players fetches            → already explicit
-- Anyone who genuinely needs a DOB reads it one row at a time while signed in
-- (web src/lib/birthDate.js getPlayerBirthDate, iOS AccountService.myBirthDate,
-- Android SquadRepository.birthDate).
--
-- `authenticated` KEEPS the column: the account page shows the owner his own DOB, and
-- the loan picker reads one row to apply the under-18 borrowing rule.
-- ---------------------------------------------------------------------------
revoke select, insert, update on public.players from anon;

grant select (
  id, first_name, last_name, jersey_number, "position", team_id,
  is_referee, is_core, age, goals, games_played, blue_cards, red_cards,
  photo_url, created_at
) on public.players to anon;

-- anon writes are already dead at the RLS layer (every write policy needs a JWT email or
-- an auth.uid()); re-granting the same column set keeps the grant shape unchanged rather
-- than silently narrowing something else, while birth_date stays out of reach.
grant insert (
  id, first_name, last_name, jersey_number, "position", team_id,
  is_referee, is_core, age, goals, games_played, blue_cards, red_cards,
  photo_url, created_at
) on public.players to anon;

grant update (
  id, first_name, last_name, jersey_number, "position", team_id,
  is_referee, is_core, age, goals, games_played, blue_cards, red_cards,
  photo_url, created_at
) on public.players to anon;

-- ---------------------------------------------------------------------------
-- A4(b) — the DOB writer had the player_teams blind spot.
--
-- It read the player's PRIMARY team and asked is_coach_of(that), so a coach of any of
-- the player's other (multi-age) teams was refused. With a coach-facing DOB entry UI
-- landing, that would have been the common case rather than the edge one: the youth
-- coach is exactly the person who knows his under-18s' dates of birth.
-- is_coach_of_player() is defined in player-unavailability.sql.
--
-- Also added: an explicit 'player not found'. The old body silently updated zero rows
-- for an admin passing an id that does not exist.
-- ---------------------------------------------------------------------------
create or replace function public.set_player_birth_date(p_player uuid, p_birth date)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_birth is not null then
    if p_birth > current_date then raise exception 'birth date in future'; end if;
    if p_birth < current_date - interval '100 years' then raise exception 'birth date too old'; end if;
  end if;
  if not (
    coalesce(public.is_admin(), false)
    or coalesce(public.is_league_manager(), false)
    or coalesce(public.is_coach_of_player(p_player), false)
    or p_player = public.my_player_id()
  ) then raise exception 'not authorized'; end if;
  if not exists (select 1 from public.players where id = p_player) then
    raise exception 'player not found';
  end if;
  update public.players set birth_date = p_birth where id = p_player;
end;
$$;
