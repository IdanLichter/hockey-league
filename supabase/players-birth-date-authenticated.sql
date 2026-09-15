-- players-birth-date-authenticated.sql (2026-09-15)
-- Follow-up to players-birth-date-privacy.sql, which closed `anon` and deliberately let
-- `authenticated` KEEP the column. That residual is the hole this file closes.
--
-- PART 1 applied to production via MCP as migrations:
--   `birth_date_minimum_disclosure`
--   `birth_dates_manageable_scope`
-- PART 2 (the revoke) is NOT applied yet — see the ordering note on it.

-- ---------------------------------------------------------------------------
-- The hole. `Public read players` is USING (true), and `birth_date` was column-granted
-- to `authenticated`. Those two together mean ANY account that completed signup could
-- GET /rest/v1/players?select=id,birth_date and receive every date on file — 26 of them,
-- four belonging to children. ~80 accounts hold that access today, most of them plain
-- players with no role at all. Anon was fixed in September; this is the same bug one
-- role over, and it is the worse half, because signing up is free.
--
-- RLS cannot fix it, for the same reason as before: the ROW is legitimately public, it is
-- one COLUMN that must not be. And PostgREST gives every signed-in caller the SAME role,
-- so no grant can distinguish a coach from a spectator. The distinction has to be drawn
-- inside a function that can see who is asking.
--
-- Three readers, three genuinely different needs, so three functions rather than one:
-- the point is that each returns the LEAST it can, not merely that each checks a role.
-- ---------------------------------------------------------------------------

-- (1) The loan rule. Whole YEARS, never a date.
--
-- The squad picker has only ever rendered "בן/בת 16" and compared against 18 — it never
-- needed the date, so it stops receiving one. An exact date of birth identifies a
-- 15-year-old; an integer does not. Gated to the people the loan rule is addressed to:
-- coaches, judges, managers. Everyone else gets no rows, which the picker reads as
-- "no date on file" — an outcome it already handles, by asking the coach to vouch.
create or replace function public.squad_loan_ages()
returns table (player_id uuid, age_years int)
language sql stable security definer set search_path = public as $$
  select p.id,
         case when p.birth_date is null then null
              else date_part('year', age(p.birth_date))::int end
  from public.players p
  where coalesce(public.is_admin(), false)
     or coalesce(public.is_league_manager(), false)
     or coalesce(public.is_coach(), false)
     or coalesce(public.is_judge(), false)
$$;

-- (2) One player's actual date, for the people entitled to EDIT it. Authorization is a
-- deliberate mirror of set_player_birth_date: if you may write it, you may read it back,
-- and there is one predicate to keep right instead of two that can drift apart.
create or replace function public.player_birth_date(p_player uuid)
returns date
language plpgsql stable security definer set search_path = public as $$
begin
  if not (
    coalesce(public.is_admin(), false)
    or coalesce(public.is_league_manager(), false)
    or coalesce(public.is_coach_of_player(p_player), false)
    or p_player = public.my_player_id()
  ) then raise exception 'not authorized'; end if;
  return (select birth_date from public.players where id = p_player);
end;
$$;

-- (3) The birth-dates tab. Reached by admins, league managers AND coaches — a coach gets
-- it because he is the person who actually knows his squad's dates, which is why he may
-- set them. So he reads back exactly the players he may write: his own, by primary card
-- or by multi-age roster row. Admin / LM get the league.
create or replace function public.manageable_birth_dates()
returns table (player_id uuid, birth_date date)
language sql stable security definer set search_path = public as $$
  select p.id, p.birth_date from public.players p
  where coalesce(public.is_admin(), false)
     or coalesce(public.is_league_manager(), false)
     or coalesce(public.is_coach_of_player(p.id), false)
$$;

revoke all on function public.squad_loan_ages() from public, anon;
revoke all on function public.player_birth_date(uuid) from public, anon;
revoke all on function public.manageable_birth_dates() from public, anon;
grant execute on function public.squad_loan_ages() to authenticated;
grant execute on function public.player_birth_date(uuid) to authenticated;
grant execute on function public.manageable_birth_dates() to authenticated;

-- ---------------------------------------------------------------------------
-- PART 2 — NOT YET APPLIED.
--
-- ORDERING MATTERS, and here it spans app stores. The functions above are additive, so
-- Part 1 ships on its own and changes nothing for existing clients. The revoke below is
-- the breaking half, and the SHIPPED mobile apps still read the column directly:
--   iOS 1.4.2      SquadService / AccountService / ManagementService
--   Android 1.4.7  SquadRepository.birthDate + .birthDates, AuthRepository.fetchBirthDate
-- Android degrades quietly (those two SquadRepository calls are inside runCatching, so a
-- 403 reads as "no date" and routes the coach to the vouch checkbox), but
-- AuthRepository.fetchBirthDate is NOT wrapped, and the birth-dates tab would simply go
-- blank on both platforms. An iOS fix is days of review away, and users update when they
-- update — so running this before both builds are OUT and adopted breaks working apps.
--
-- Web is already migrated (this commit) and works either way.
--
-- A bare `REVOKE SELECT (birth_date)` is a NO-OP: Postgres keeps the table-level grant,
-- which covers every column. The table-level privilege has to go and the remaining
-- columns be re-granted individually — the same shape as the anon fix.
-- ---------------------------------------------------------------------------
-- revoke select, insert, update on public.players from authenticated;
--
-- grant select (
--   id, first_name, last_name, jersey_number, "position", team_id,
--   is_referee, is_core, age, goals, games_played, blue_cards, red_cards,
--   photo_url, created_at, slug
-- ) on public.players to authenticated;
--
-- grant insert (
--   id, first_name, last_name, jersey_number, "position", team_id,
--   is_referee, is_core, age, goals, games_played, blue_cards, red_cards,
--   photo_url, created_at, slug
-- ) on public.players to authenticated;
--
-- grant update (
--   id, first_name, last_name, jersey_number, "position", team_id,
--   is_referee, is_core, age, goals, games_played, blue_cards, red_cards,
--   photo_url, created_at, slug
-- ) on public.players to authenticated;
