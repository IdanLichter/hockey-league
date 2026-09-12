-- player-unavailability.sql (F1 / A3 — 2026-09-12)
-- Applied to production via MCP as migrations:
--   `player_unavailability_table_and_predicate`
--   `player_unavailability_rpcs`
--   `player_unavailability_lock_down_grants`
--   `restrict_is_unavailable_to_authenticated`
--   `gate_registration_on_is_unavailable`   (the two gates — see availability-medical-gate.sql
--                                            and squad-rules.sql for their current bodies)
--
-- Player availability constraints. A suspension says "you may not play"; this says
-- "I cannot play" — injured, abroad, on reserve duty. Deliberately the same shape as
-- player-suspensions.sql: a row, a predicate, and the two registration gates consult
-- both. The difference is who starts it. A player self-reports and it waits at 'pending'
-- until his coach or a manager decides; a coach or manager filing it IS the decision, so
-- it lands 'approved' straight away.
--
-- New notification types (native clients need these):
--   unavailability_reported   → the player's coaches (managers if he has none)
--   unavailability_approved   → the player
--   unavailability_rejected   → the player
-- Registered in src/lib/notifications.js and supabase/functions/send-push/index.ts.

-- ---------------------------------------------------------------------------
-- Shared helper: "a coach of this player", covering multi-age rosters.
--
-- `is_coach_of(pl.team_id)` asks only about a player's PRIMARY team. Since multi-age
-- rosters landed, player_teams is the source of truth and players.team_id is a derived
-- mirror of one of them — so a youth-team coach whose player's primary card sits on the
-- senior side fails that check and is refused on his own player. Every authorisation
-- path meaning "a coach of this player" should ask this instead. See also A4: the
-- medical storage policy (medical-roster-file-view.sql) and set_player_birth_date
-- (players-birth-date-privacy.sql) had exactly this blind spot.
-- ---------------------------------------------------------------------------
create or replace function public.is_coach_of_player(p_player uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select exists (
      select 1 from public.players pl
      where pl.id = p_player and public.is_coach_of(pl.team_id)
    ) or exists (
      select 1 from public.player_teams pt
      where pt.player_id = p_player and public.is_coach_of(pt.team_id)
    )
  ), false)
$$;
-- Postgres grants EXECUTE to PUBLIC by default; an anonymous caller can have no coach
-- role, so there is no reason to expose it to one.
revoke execute on function public.is_coach_of_player(uuid) from public, anon;
grant execute on function public.is_coach_of_player(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The table.
-- ---------------------------------------------------------------------------
create table if not exists public.player_unavailability (
  id             uuid primary key default gen_random_uuid(),
  player_id      uuid not null references public.players(id) on delete cascade,
  kind           text not null check (kind in ('injury','abroad','reserve_duty','other')),
  starts_on      date not null,
  -- NULL = open-ended. An injury rarely comes with a return date on day one, and forcing
  -- an invented one would either block the player too long or let him back too early.
  -- clear_unavailability() is how an open-ended row is ended.
  ends_on        date,
  reason         text,
  status         text not null default 'pending'
                 check (status in ('pending','approved','rejected')),
  created_by     uuid references auth.users(id),
  approved_by    uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  decided_at     timestamptz,
  decision_note  text,
  constraint player_unavailability_dates_ordered
    check (ends_on is null or ends_on >= starts_on)
);

create index if not exists player_unavailability_player_idx
  on public.player_unavailability(player_id);
create index if not exists player_unavailability_active_idx
  on public.player_unavailability(player_id, starts_on, ends_on)
  where status = 'approved';
create index if not exists player_unavailability_pending_idx
  on public.player_unavailability(player_id) where status = 'pending';
create index if not exists player_unavailability_created_by_idx
  on public.player_unavailability(created_by);
create index if not exists player_unavailability_approved_by_idx
  on public.player_unavailability(approved_by);

alter table public.player_unavailability enable row level security;

-- Mirrors "read suspensions self/coach/manager", INCLUDING the player_teams branch.
-- Nobody writes directly; every write goes through the RPCs below.
drop policy if exists "read unavailability self/coach/manager" on public.player_unavailability;
create policy "read unavailability self/coach/manager" on public.player_unavailability
  for select using (
    player_id = public.my_player_id()
    or coalesce(public.is_admin(), false)
    or coalesce(public.is_league_manager(), false)
    or exists (
      select 1 from public.players pl
      where pl.id = player_unavailability.player_id
        and coalesce(public.is_coach_of(pl.team_id), false)
    )
    or exists (
      select 1 from public.player_teams pt
      where pt.player_id = player_unavailability.player_id
        and coalesce(public.is_coach_of(pt.team_id), false)
    )
  );

-- Supabase's default privileges hand every new public table to anon AND authenticated
-- with full DML. RLS was already the real gate (there is only a SELECT policy, so writes
-- fall through to deny), but "writes via RPCs only" should be true at the grant layer too
-- rather than resting on the absence of a policy someone might later add.
-- anon gets nothing at all: who is injured or on reserve duty is not public information.
revoke all on public.player_unavailability from anon;
revoke all on public.player_unavailability from authenticated;
grant select on public.player_unavailability to authenticated;

-- ---------------------------------------------------------------------------
-- The predicate the registration gates call.
-- ---------------------------------------------------------------------------
-- APPROVED rows only — a pending self-report must not silently lock a player out
-- before anyone has looked at it.
create or replace function public.is_unavailable(p_player uuid, p_on date default current_date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.player_unavailability u
    where u.player_id = p_player
      and u.status = 'approved'
      and u.starts_on <= coalesce(p_on, current_date)
      and (u.ends_on is null or u.ends_on >= coalesce(p_on, current_date))
  )
$$;
-- Default PUBLIC execute would let a logged-out visitor ask is_unavailable(<any player>)
-- and be told whether that person is injured or on reserve duty — the same class of
-- personal information the birth_date revoke was about.
revoke execute on function public.is_unavailable(uuid, date) from public, anon;
grant execute on function public.is_unavailable(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Writes. RPCs only.
-- ---------------------------------------------------------------------------

-- A player self-reports (→ pending); a coach of ANY of his teams, an admin, or the
-- league manager files it on his behalf (→ approved on the spot, since the person who
-- would have approved it is the one entering it).
create or replace function public.report_unavailability(
  p_kind text,
  p_starts_on date,
  p_ends_on date default null,
  p_reason text default null,
  p_player uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me       uuid := (select auth.uid());
  v_player   uuid := coalesce(p_player, public.my_player_id());
  v_reason   text := nullif(btrim(coalesce(p_reason, '')), '');
  v_official boolean;
  v_status   text;
  v_name     text;
  v_id       uuid;
  v_coaches  int := 0;
  v_data     jsonb;
  rec        record;
begin
  if v_me is null then raise exception 'not authorized'; end if;
  if v_player is null then raise exception 'no linked player'; end if;
  if p_kind not in ('injury','abroad','reserve_duty','other') then raise exception 'bad kind'; end if;
  if p_starts_on is null then raise exception 'start date required'; end if;
  if p_ends_on is not null and p_ends_on < p_starts_on then raise exception 'end before start'; end if;

  select btrim(pl.first_name || ' ' || pl.last_name) into v_name
    from public.players pl where pl.id = v_player;
  if v_name is null then raise exception 'player not found'; end if;

  v_official := coalesce(public.is_admin(), false)
             or coalesce(public.is_league_manager(), false)
             or coalesce(public.is_coach_of_player(v_player), false);

  if not (v_official or v_player = public.my_player_id()) then
    raise exception 'not authorized';
  end if;

  v_status := case when v_official then 'approved' else 'pending' end;

  insert into public.player_unavailability
    (player_id, kind, starts_on, ends_on, reason, status, created_by,
     approved_by, decided_at)
  values
    (v_player, p_kind, p_starts_on, p_ends_on, v_reason, v_status, v_me,
     case when v_official then v_me end,
     case when v_official then now() end)
  returning id into v_id;

  -- Only a self-report needs anyone told; an official filing it already knows.
  if v_status = 'pending' then
    v_data := jsonb_build_object(
      'player_id', v_player, 'player_name', coalesce(v_name, ''),
      'kind', p_kind, 'starts_on', p_starts_on, 'ends_on', p_ends_on,
      'reason', coalesce(v_reason, ''), 'unavailability_id', v_id);

    -- Every coach of every team he plays for, not just his primary card's coach.
    for rec in
      select distinct ur.user_id
        from public.user_roles ur
       where ur.role = 'coach'
         and ur.team_id in (
           select pl.team_id from public.players pl
            where pl.id = v_player and pl.team_id is not null
           union
           select pt.team_id from public.player_teams pt where pt.player_id = v_player
         )
    loop
      perform public.create_notification(
        rec.user_id, 'unavailability_reported', v_me, 'player', v_player::text, v_data);
      v_coaches := v_coaches + 1;
    end loop;

    -- Coach-first, managers as the fallback — the same shape notify_team_reviewers uses,
    -- spelled out here because the recipient set spans several teams.
    if v_coaches = 0 then
      for rec in select user_id from public.manager_user_ids() loop
        perform public.create_notification(
          rec.user_id, 'unavailability_reported', v_me, 'player', v_player::text, v_data);
      end loop;
    end if;
  end if;

  return v_id;
end;
$$;
revoke execute on function public.report_unavailability(text, date, date, text, uuid) from public, anon;
grant execute on function public.report_unavailability(text, date, date, text, uuid) to authenticated;

-- A coach of any of his teams, an admin, or the league manager rules on a self-report.
create or replace function public.decide_unavailability(
  p_id uuid, p_approve boolean, p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := (select auth.uid());
  v_row    record;
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
  v_name   text;
  v_status text;
  rec      record;
begin
  if v_me is null then raise exception 'not authorized'; end if;
  if p_approve is null then raise exception 'decision required'; end if;

  select * into v_row from public.player_unavailability where id = p_id;
  if v_row.id is null then raise exception 'not found'; end if;

  if not (coalesce(public.is_admin(), false)
          or coalesce(public.is_league_manager(), false)
          or coalesce(public.is_coach_of_player(v_row.player_id), false)) then
    raise exception 'not authorized';
  end if;

  if v_row.status <> 'pending' then raise exception 'already decided'; end if;

  v_status := case when p_approve then 'approved' else 'rejected' end;

  update public.player_unavailability
     set status = v_status, approved_by = v_me, decided_at = now(), decision_note = v_note
   where id = p_id;

  select btrim(pl.first_name || ' ' || pl.last_name) into v_name
    from public.players pl where pl.id = v_row.player_id;

  -- Tell the player. He asked to be excused; silence would leave him guessing whether
  -- he is expected at the next fixture.
  for rec in select pr.id as user_id from public.profiles pr where pr.player_id = v_row.player_id loop
    perform public.create_notification(
      rec.user_id,
      case when p_approve then 'unavailability_approved' else 'unavailability_rejected' end,
      v_me, 'player', v_row.player_id::text,
      jsonb_build_object(
        'player_id', v_row.player_id, 'player_name', coalesce(v_name, ''),
        'kind', v_row.kind, 'starts_on', v_row.starts_on, 'ends_on', v_row.ends_on,
        'decision_note', coalesce(v_note, ''), 'unavailability_id', v_row.id));
  end loop;
end;
$$;
revoke execute on function public.decide_unavailability(uuid, boolean, text) from public, anon;
grant execute on function public.decide_unavailability(uuid, boolean, text) to authenticated;

-- End an absence early, or retract one you filed yourself.
--
-- The status vocabulary is pending/approved/rejected, so "cleared" has to be expressed
-- through the dates: an absence already under way is closed by moving ends_on to
-- yesterday, which makes is_unavailable() false from today. One that has not begun yet
-- never took effect, so retracting it IS a rejection of it — and the date constraint
-- (ends_on >= starts_on) would refuse yesterday anyway.
create or replace function public.clear_unavailability(p_id uuid, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := (select auth.uid());
  v_row    record;
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
  v_official boolean;
begin
  if v_me is null then raise exception 'not authorized'; end if;

  select * into v_row from public.player_unavailability where id = p_id;
  if v_row.id is null then raise exception 'not found'; end if;

  v_official := coalesce(public.is_admin(), false)
             or coalesce(public.is_league_manager(), false)
             or coalesce(public.is_coach_of_player(v_row.player_id), false);

  -- A player may withdraw his OWN request while it is still pending. Ending an approved
  -- absence is the coach's or manager's call — he is the one who has to plan around it.
  if not (v_official
          or (v_row.player_id = public.my_player_id() and v_row.status = 'pending')) then
    raise exception 'not authorized';
  end if;

  if v_row.status = 'rejected' then raise exception 'already cleared'; end if;

  if v_row.status = 'pending' or v_row.starts_on >= current_date then
    update public.player_unavailability
       set status = 'rejected', approved_by = v_me, decided_at = now(),
           decision_note = v_note
     where id = p_id;
  else
    update public.player_unavailability
       set ends_on = current_date - 1, approved_by = v_me, decided_at = now(),
           decision_note = v_note
     where id = p_id;
  end if;
end;
$$;
revoke execute on function public.clear_unavailability(uuid, text) from public, anon;
grant execute on function public.clear_unavailability(uuid, text) to authenticated;
