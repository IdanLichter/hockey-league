-- game-change-requests.sql
-- ---------------------------------------------------------------------------
-- Coach-requested game reschedules, approved by a league-manager / admin.
--
-- A coach of EITHER team in a game may request a change to its date/time and/or
-- venue, with a reason. A league-manager or admin then approves — which
-- ATOMICALLY writes the proposed date/venue onto the games row — or rejects with
-- a note. Both sides get a bell notification.
--
-- Mirrors team_join_requests (Package 1b): every write goes through a
-- SECURITY DEFINER RPC (so RLS on games/notifications is never the gate and can't
-- be forged from the client), reads are governed by RLS, and notifications are
-- best-effort triggers that never roll back the source write.
--
-- Deliberately NARROW for v1: only date/time + venue change. It never touches
-- scores, status, standings, or game_stats — approving just moves the fixture.
-- ---------------------------------------------------------------------------

create table if not exists public.game_change_requests (
  id             uuid primary key default gen_random_uuid(),
  game_id        uuid not null references public.games(id)    on delete cascade,
  requested_by   uuid not null references public.profiles(id) on delete cascade,
  -- Which of the two teams the requesting coach represents (context for the
  -- manager's review card). set null if the team is later deleted.
  team_id        uuid references public.teams(id) on delete set null,
  proposed_date  timestamptz,           -- new date/time (null = leave unchanged)
  proposed_venue text,                  -- new venue     (null = leave unchanged)
  reason         text not null,
  -- Snapshot of the game's date/venue at submit time, so the request stays a
  -- readable "was → wants" record even after the game is later edited.
  original_date  timestamptz,
  original_venue text,
  status         text not null default 'pending'
                 check (status in ('pending','approved','rejected','cancelled')),
  decision_note  text,                  -- optional manager note on approve/reject
  reviewed_by    uuid,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now()
);

-- At most one OPEN request per game → the manager resolves one at a time and two
-- coaches can never have conflicting approvals applied. A second submit while one
-- is pending raises 23505, which the client renders as a friendly message.
create unique index if not exists game_change_requests_one_pending_per_game
  on public.game_change_requests(game_id) where status = 'pending';
create index if not exists game_change_requests_game_idx
  on public.game_change_requests(game_id);
create index if not exists game_change_requests_status_idx
  on public.game_change_requests(status, created_at desc);

alter table public.game_change_requests enable row level security;

-- READ: the requester, a coach of either team in the game, admins, managers.
-- (No INSERT/UPDATE/DELETE policies — all writes go through the RPCs below.)
drop policy if exists "Read own team or manager game change requests" on public.game_change_requests;
create policy "Read own team or manager game change requests"
  on public.game_change_requests for select using (
    requested_by = auth.uid()
    or public.is_admin()
    or public.is_league_manager()
    or exists (
      select 1 from public.games g
      where g.id = game_change_requests.game_id
        and (public.is_coach_of(g.home_team_id) or public.is_coach_of(g.away_team_id))
    )
  );

-- ============================ WRITE RPCs ==================================

-- Coach submits a request. Gated to a coach of one of the two teams; admins and
-- managers edit games directly and don't use this queue.
create or replace function public.request_game_change(
  p_game_id       uuid,
  p_proposed_date timestamptz,
  p_proposed_venue text,
  p_reason        text
) returns public.game_change_requests
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_game public.games;
  v_team uuid;
  v_row  public.game_change_requests;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_game from public.games where id = p_game_id;
  if v_game.id is null then raise exception 'game not found'; end if;

  if public.is_coach_of(v_game.home_team_id) then
    v_team := v_game.home_team_id;
  elsif public.is_coach_of(v_game.away_team_id) then
    v_team := v_game.away_team_id;
  else
    raise exception 'not authorized: only a coach of one of the teams may request a change';
  end if;

  if v_game.status not in ('scheduled','postponed') then
    raise exception 'only a scheduled or postponed game can be changed';
  end if;

  p_proposed_venue := nullif(btrim(p_proposed_venue), '');
  p_reason         := nullif(btrim(p_reason), '');
  if p_reason is null then
    raise exception 'a reason is required';
  end if;
  if p_proposed_date is null and p_proposed_venue is null then
    raise exception 'propose a new date/time or a new venue';
  end if;

  insert into public.game_change_requests(
    game_id, requested_by, team_id, proposed_date, proposed_venue, reason,
    original_date, original_venue, status
  ) values (
    p_game_id, v_uid, v_team, p_proposed_date, p_proposed_venue, p_reason,
    v_game.game_date, v_game.venue, 'pending'
  ) returning * into v_row;

  return v_row;
end; $$;

-- Manager/admin approves → applies the proposed fields to the game atomically.
create or replace function public.approve_game_change(p_id uuid, p_note text default null)
returns public.game_change_requests
language plpgsql security definer set search_path = public as $$
declare v_row public.game_change_requests;
begin
  if not (public.is_admin() or public.is_league_manager()) then
    raise exception 'not authorized';
  end if;

  select * into v_row from public.game_change_requests where id = p_id for update;
  if v_row.id is null then raise exception 'request not found'; end if;
  if v_row.status <> 'pending' then raise exception 'request already %', v_row.status; end if;

  update public.games set
    game_date = coalesce(v_row.proposed_date,  game_date),
    venue     = coalesce(v_row.proposed_venue, venue)
  where id = v_row.game_id;

  update public.game_change_requests set
    status        = 'approved',
    decision_note = nullif(btrim(p_note), ''),
    reviewed_by   = auth.uid(),
    reviewed_at   = now()
  where id = p_id
  returning * into v_row;

  return v_row;
end; $$;

-- Manager/admin rejects (game untouched).
create or replace function public.reject_game_change(p_id uuid, p_note text default null)
returns public.game_change_requests
language plpgsql security definer set search_path = public as $$
declare v_row public.game_change_requests;
begin
  if not (public.is_admin() or public.is_league_manager()) then
    raise exception 'not authorized';
  end if;

  select * into v_row from public.game_change_requests where id = p_id for update;
  if v_row.id is null then raise exception 'request not found'; end if;
  if v_row.status <> 'pending' then raise exception 'request already %', v_row.status; end if;

  update public.game_change_requests set
    status        = 'rejected',
    decision_note = nullif(btrim(p_note), ''),
    reviewed_by   = auth.uid(),
    reviewed_at   = now()
  where id = p_id
  returning * into v_row;

  return v_row;
end; $$;

-- Coach withdraws their own still-pending request.
create or replace function public.cancel_game_change_request(p_id uuid)
returns public.game_change_requests
language plpgsql security definer set search_path = public as $$
declare v_row public.game_change_requests;
begin
  select * into v_row from public.game_change_requests where id = p_id for update;
  if v_row.id is null then raise exception 'request not found'; end if;
  if v_row.requested_by <> auth.uid() then raise exception 'not authorized'; end if;
  if v_row.status <> 'pending' then raise exception 'request already %', v_row.status; end if;

  update public.game_change_requests set status = 'cancelled'
  where id = p_id
  returning * into v_row;

  return v_row;
end; $$;

revoke all on function public.request_game_change(uuid,timestamptz,text,text)   from public, anon;
revoke all on function public.approve_game_change(uuid,text)                    from public, anon;
revoke all on function public.reject_game_change(uuid,text)                     from public, anon;
revoke all on function public.cancel_game_change_request(uuid)                  from public, anon;
grant execute on function public.request_game_change(uuid,timestamptz,text,text) to authenticated;
grant execute on function public.approve_game_change(uuid,text)                  to authenticated;
grant execute on function public.reject_game_change(uuid,text)                   to authenticated;
grant execute on function public.cancel_game_change_request(uuid)               to authenticated;

-- ========================= NOTIFICATIONS ================================
-- Best-effort, exception-wrapped: a notification failure must never roll back a
-- request insert or a manager's decision.

-- New request → fan out to every admin + league-manager (except the requester).
create or replace function public.notify_managers_new_game_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_home text; v_away text;
begin
  select ht.name, at2.name into v_home, v_away
  from public.games g
  left join public.teams ht  on ht.id  = g.home_team_id
  left join public.teams at2 on at2.id = g.away_team_id
  where g.id = NEW.game_id;

  insert into public.notifications(user_id, type, actor_id, entity_type, entity_id, data)
  select r.uid, 'game_change_request', NEW.requested_by, 'game', NEW.game_id::text,
         jsonb_build_object(
           'home_team', coalesce(v_home,''), 'away_team', coalesce(v_away,''),
           'proposed_date', NEW.proposed_date, 'proposed_venue', NEW.proposed_venue,
           'reason', left(coalesce(NEW.reason,''), 120))
  from (
    select au.id as uid from public.admin_users a join auth.users au on au.email = a.email
    union
    select ur.user_id as uid from public.user_roles ur where ur.role = 'league_manager'
  ) r
  where r.uid is not null and r.uid <> NEW.requested_by;

  return null;
exception when others then return null;
end; $$;
drop trigger if exists trg_notify_new_game_change on public.game_change_requests;
create trigger trg_notify_new_game_change after insert on public.game_change_requests
  for each row execute function public.notify_managers_new_game_change();

-- Decision → notify the requesting coach.
create or replace function public.notify_on_game_change_decision() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_home text; v_away text;
begin
  if NEW.status is distinct from OLD.status and NEW.status in ('approved','rejected') then
    select ht.name, at2.name into v_home, v_away
    from public.games g
    left join public.teams ht  on ht.id  = g.home_team_id
    left join public.teams at2 on at2.id = g.away_team_id
    where g.id = NEW.game_id;

    perform public.create_notification(
      NEW.requested_by,
      case when NEW.status = 'approved' then 'game_change_approved' else 'game_change_rejected' end,
      NEW.reviewed_by, 'game', NEW.game_id::text,
      jsonb_build_object(
        'home_team', coalesce(v_home,''), 'away_team', coalesce(v_away,''),
        'decision_note', coalesce(NEW.decision_note,'')));
  end if;
  return null;
exception when others then return null;
end; $$;
drop trigger if exists trg_notify_game_change_decision on public.game_change_requests;
create trigger trg_notify_game_change_decision after update on public.game_change_requests
  for each row execute function public.notify_on_game_change_decision();

revoke execute on function public.notify_managers_new_game_change() from public, anon, authenticated;
revoke execute on function public.notify_on_game_change_decision()  from public, anon, authenticated;
