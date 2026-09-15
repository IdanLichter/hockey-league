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
-- PART 2 — NOT YET APPLIED. RUN THIS WHEN BOTH MOBILE BUILDS ARE **LIVE**.
--
-- "Live" means SHIPPED AND INSTALLABLE, not submitted:
--   * iOS 1.4.3 (27)      READY_FOR_SALE on the App Store  (scripts/asc_version_state.py)
--   * Android 1.4.8 (23)  actually distributed, AND league_settings.android_latest_version
--                         bumped to 23 so the in-app banner tells people to update
-- Until then the shipped clients (iOS 1.4.2, Android 1.4.6/1.4.7) still read the column
-- directly and this revoke breaks working apps. Web is already migrated either way.
--
-- WHY THIS BLOCK ASSERTS INSTEAD OF JUST REVOKING.
-- The failure mode here is silent: a bare `REVOKE SELECT (birth_date)` is a NO-OP,
-- because Postgres keeps the TABLE-level grant and that covers every column. You get no
-- error, and the hole this whole change exists to close stays open. So the revoke and its
-- proof are one transaction: if `authenticated` still holds SELECT at the end, the
-- exception rolls the whole thing back and says so. It cannot half-succeed quietly.
--
-- Run it as a single statement (it is one transaction).
-- ---------------------------------------------------------------------------
/*
begin;

-- The table-level privilege has to go first; re-grant every column EXCEPT birth_date.
revoke select, insert, update on public.players from authenticated;

grant select (
  id, first_name, last_name, jersey_number, "position", team_id,
  is_referee, is_core, age, goals, games_played, blue_cards, red_cards,
  photo_url, created_at, slug
) on public.players to authenticated;

grant insert (
  id, first_name, last_name, jersey_number, "position", team_id,
  is_referee, is_core, age, goals, games_played, blue_cards, red_cards,
  photo_url, created_at, slug
) on public.players to authenticated;

grant update (
  id, first_name, last_name, jersey_number, "position", team_id,
  is_referee, is_core, age, goals, games_played, blue_cards, red_cards,
  photo_url, created_at, slug
) on public.players to authenticated;

-- Proof, in the same transaction as the change it proves.
do $$
begin
  if has_column_privilege('authenticated', 'public.players', 'birth_date', 'SELECT') then
    raise exception
      'REVOKE FAILED: authenticated still holds SELECT on players.birth_date — the table-level grant survived, so nothing was actually closed';
  end if;
  if not has_column_privilege('authenticated', 'public.players', 'first_name', 'SELECT') then
    raise exception
      'OVER-REVOKED: authenticated lost SELECT on first_name — the public player list is now broken for signed-in users';
  end if;
  raise notice 'OK: birth_date is no longer readable by authenticated; the other columns survive.';
end $$;

commit;
*/

-- AFTERWARDS, confirm from outside the transaction:
--   select grantee, privilege_type from information_schema.column_privileges
--   where table_schema='public' and table_name='players' and column_name='birth_date';
-- `authenticated` must appear with INSERT/REFERENCES/UPDATE but NOT SELECT.
--
-- Then smoke-test the three RPC paths while signed in as a coach: the squad picker still
-- shows "בן/בת <age>" on a loan, the account page still shows the owner his own date, and
-- the birth-dates tab still lists his squad. All three go through functions, so all three
-- should be untouched — that is the point of the change.
--
-- IF SOMETHING BREAKS: re-granting is instant and safe —
--   grant select (birth_date) on public.players to authenticated;
-- That reopens the hole, so treat it as a stopgap while the real cause is found.
