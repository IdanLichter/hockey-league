-- approval-and-expiry.sql (P6 — 2026-08-02)
-- Applied to production via MCP as migration `approval_and_expiry`.
--
--   row 27 לתזכר x ימים לשחקן ומאמן לפני שפג תוקף בדיקה
--   row 29 מנהל ליגה מצליח לאשר שחקנים … התראה לשחקן ומאמן שהשחקן אושר
--   row 30 מה עושים במקרה שמנהל ליגה לא מאשר מסיבה כלשהי?
--
-- Row 30 was an open question in the sheet; the decision was "reason required, and the
-- player can fix it and resubmit". Today a rejection is silent — no reason is stored
-- anywhere, so the submitter sees "נדחה" and has no idea what to change. That turns a
-- dead end into a loop that closes itself.

-- ---------------------------------------------------------------------------
-- Row 27 — the expiry reminder reaches the COACH as well as the player.
-- Extends notify_expiring_medical from medical-roster-and-expiry.sql, which fires at
-- 30 and 7 days. The player may not even have an account; the coach is the one who can
-- actually chase it.
-- ---------------------------------------------------------------------------
create or replace function public.notify_expiring_medical()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select mc.player_id, mc.expires_at, (mc.expires_at - current_date) as days_left,
           p.first_name, p.last_name, p.team_id
    from public.medical_certificates mc
    join public.players p on p.id = mc.player_id
    where mc.status = 'approved'
      and mc.expires_at in (current_date + 30, current_date + 7)
  loop
    -- the player himself, if his account is linked
    perform public.create_notification(
      pr.id, 'medical_expiring', null::uuid, 'player', r.player_id::text,
      jsonb_build_object('expires_at', r.expires_at, 'days_left', r.days_left))
    from public.profiles pr where pr.player_id = r.player_id;

    -- every coach of a team he plays for
    perform public.create_notification(
      c.user_id, 'medical_expiring_player', null::uuid, 'player', r.player_id::text,
      jsonb_build_object('expires_at', r.expires_at, 'days_left', r.days_left,
                         'player_name', btrim(r.first_name || ' ' || r.last_name)))
    from (
      select distinct ur.user_id
      from public.user_roles ur
      where ur.role = 'coach'
        and (ur.team_id = r.team_id
             or ur.team_id in (select pt.team_id from public.player_teams pt
                               where pt.player_id = r.player_id))
    ) c;
  end loop;
end;
$$;
revoke all on function public.notify_expiring_medical() from public, anon, authenticated;
grant execute on function public.notify_expiring_medical() to service_role;

-- ---------------------------------------------------------------------------
-- Rows 29 + 30 — approving and rejecting a submitted player card.
-- ---------------------------------------------------------------------------
alter table public.player_submissions
  add column if not exists decision_note text;

-- Who should hear about this submission: the person who submitted it, plus the coaches
-- of the team it was filed under. Row 29 asks for "התראה לשחקן ומאמן".
create or replace function public.submission_audience(p_submission uuid)
returns table (user_id uuid) language sql stable security definer set search_path = public as $$
  select s.profile_id from public.player_submissions s where s.id = p_submission
  union
  select ur.user_id
  from public.player_submissions s
  join public.user_roles ur on ur.role = 'coach' and ur.team_id = s.team_id
  where s.id = p_submission
$$;

-- Rejection now REQUIRES a reason, and says it to both the submitter and the coach.
--
-- The old single-argument version MUST be dropped, not just replaced: adding a
-- defaulted parameter creates a NEW function and leaves the 1-arg one in place, and
-- Postgres prefers the exact-arity match — so every existing 1-arg caller would keep
-- hitting the old body and sail straight past the reason requirement.
drop function if exists public.reject_player_submission(uuid);
create or replace function public.reject_player_submission(p_submission_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_team uuid; v_status text; v_name text; rec record;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select team_id, status, btrim(first_name || ' ' || last_name)
    into v_team, v_status, v_name
    from public.player_submissions where id = p_submission_id;
  if v_team is null then raise exception 'submission not found'; end if;
  if not (public.is_admin() or public.is_league_manager() or public.is_coach_of(v_team)) then
    raise exception 'not authorized';
  end if;
  -- The whole point of row 30: a refusal the submitter cannot act on is a dead end.
  if v_reason is null then raise exception 'reason is required'; end if;

  update public.player_submissions
     set status = 'rejected', decision_note = v_reason,
         reviewed_at = now(), reviewed_by = (select auth.uid())
   where id = p_submission_id;

  for rec in select user_id from public.submission_audience(p_submission_id) loop
    if rec.user_id is not null then
      perform public.create_notification(
        rec.user_id, 'player_submission_rejected', (select auth.uid()),
        'team', v_team::text,
        jsonb_build_object('candidate_name', coalesce(v_name, ''), 'reason', v_reason));
    end if;
  end loop;
end;
$$;
revoke all on function public.reject_player_submission(uuid, text) from public, anon;
grant execute on function public.reject_player_submission(uuid, text) to authenticated;

-- Row 29: on approval, tell the submitter AND the coach.
create or replace function public.notify_submission_approved()
returns trigger language plpgsql security definer set search_path = public as $$
declare rec record; v_name text;
begin
  if NEW.status = 'approved' and OLD.status is distinct from 'approved' then
    v_name := btrim(coalesce(NEW.first_name, '') || ' ' || coalesce(NEW.last_name, ''));
    for rec in select user_id from public.submission_audience(NEW.id) loop
      if rec.user_id is not null then
        perform public.create_notification(
          rec.user_id, 'player_submission_approved', null::uuid, 'team', NEW.team_id::text,
          jsonb_build_object('candidate_name', v_name, 'player_id', NEW.player_id));
      end if;
    end loop;
  end if;
  return null;
exception when others then return null;
end;
$$;

drop trigger if exists trg_notify_submission_approved on public.player_submissions;
create trigger trg_notify_submission_approved
  after update of status on public.player_submissions
  for each row execute function public.notify_submission_approved();
