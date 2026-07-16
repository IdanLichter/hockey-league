-- ============================================================================
-- notifications-parity.sql
--
-- Backfills the notification bell (+ push, which rides every notifications row
-- via trg_notify_push) for the request/approve flows shipped AFTER the original
-- notifications-schema.sql, so they behave like the player-claim flow that
-- already notifies both sides:
--
--   • team join requests      (team_join_requests)   request/approve/reject
--   • self-service player cards(player_submissions)   request/approve/reject
--   • medical certificates     (medical_certificates) upload/approve/reject
--   • tournament invitations   (tournament_teams)     invite/accept/decline
--
-- Every review RPC UPDATEs a `status` column (never deletes the row), so the
-- pattern mirrors notifications-schema.sql exactly: an AFTER INSERT trigger for
-- the incoming request, an AFTER UPDATE trigger for the decision. All functions
-- are SECURITY DEFINER + exception-wrapped: recording a notification must never
-- roll back the underlying like/join/approval.
--
-- Recipients are COACH-FIRST, so the person who owns a request hears it without
-- spamming the whole admin team (admins still see every pending item in /admin):
--   team join / medical / tournament / player card (team) → the team's coach(es);
--     falls back to admins only when the team has NO coach, so nothing is lost.
--   player card (free agent, no team) → admins + league managers (who approve it).
-- (matches approve_team_join / approve_player_submission / review_medical_
--  certificate / respond_tournament_invite, whose authz is is_admin | is_coach_of.)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Fan-out helper: notify whoever should review a team-scoped request.
-- Coach-first: the team's coach(es) if any; otherwise admins (+ league managers
-- when p_include_managers, for free-agent player cards that have no coach).
-- Never notifies the actor. SECURITY DEFINER + revoked from clients: reachable
-- only from the triggers below.
-- ----------------------------------------------------------------------------
create or replace function public.notify_team_reviewers(
  p_team_id uuid, p_type text, p_actor uuid,
  p_entity_type text, p_entity_id text, p_data jsonb,
  p_include_managers boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
declare v_has_coach boolean;
begin
  select exists(
    select 1 from public.user_roles where role = 'coach' and team_id = p_team_id
  ) into v_has_coach;

  insert into public.notifications(user_id, type, actor_id, entity_type, entity_id, data)
  select distinct r.uid, p_type, p_actor, p_entity_type, p_entity_id, coalesce(p_data, '{}'::jsonb)
  from (
    -- the team's coach(es) own the request...
    select ur.user_id as uid
      from public.user_roles ur
     where v_has_coach and ur.role = 'coach' and ur.team_id = p_team_id
    union
    -- ...otherwise fall back to admins so nothing goes unseen
    select au.id
      from public.admin_users a
      join auth.users au on au.email = a.email
     where not v_has_coach
    union
    -- free-agent player cards (no team/coach) are approved by league managers too
    select ur.user_id
      from public.user_roles ur
     where not v_has_coach and p_include_managers and ur.role = 'league_manager'
  ) r
  where r.uid is not null
    and r.uid <> coalesce(p_actor, '00000000-0000-0000-0000-000000000000'::uuid);
exception when others then
  return;   -- best-effort: never propagate
end; $$;
revoke all on function public.notify_team_reviewers(uuid,text,uuid,text,text,jsonb,boolean) from public, anon, authenticated;

-- ============================================================================
-- 1) TEAM JOIN REQUESTS
-- ============================================================================

-- ---- a player asked to join your team ---------------------------------------
create or replace function public.notify_team_join_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pname text; v_tname text;
begin
  if NEW.status = 'pending' then
    select trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')) into v_pname
      from public.players where id = NEW.player_id;
    select name into v_tname from public.teams where id = NEW.team_id;
    perform public.notify_team_reviewers(
      NEW.team_id, 'team_join_request', NEW.profile_id,
      'team_join', NEW.id::text,
      jsonb_build_object('player_name', coalesce(v_pname,''), 'team_name', coalesce(v_tname,''),
                         'team_id', NEW.team_id, 'note', coalesce(NEW.note,'')));
  end if;
  return null;
exception when others then return null;
end; $$;
drop trigger if exists trg_notify_team_join_request on public.team_join_requests;
create trigger trg_notify_team_join_request after insert on public.team_join_requests
  for each row execute function public.notify_team_join_request();

-- ---- your join request was approved / rejected ------------------------------
create or replace function public.notify_team_join_decision() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_tname text;
begin
  if NEW.status is distinct from OLD.status and NEW.status in ('approved','rejected') then
    select name into v_tname from public.teams where id = NEW.team_id;
    perform public.create_notification(
      NEW.profile_id,
      case when NEW.status = 'approved' then 'team_join_approved' else 'team_join_rejected' end,
      NEW.reviewed_by, 'team', NEW.team_id::text,
      jsonb_build_object('team_name', coalesce(v_tname,''), 'team_id', NEW.team_id));
  end if;
  return null;
exception when others then return null;
end; $$;
drop trigger if exists trg_notify_team_join_decision on public.team_join_requests;
create trigger trg_notify_team_join_decision after update on public.team_join_requests
  for each row execute function public.notify_team_join_decision();

-- ============================================================================
-- 2) SELF-SERVICE PLAYER CARDS (player_submissions)
-- ============================================================================

-- ---- a new player card was proposed for your team ---------------------------
create or replace function public.notify_player_submission_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_cname text; v_tname text;
begin
  if NEW.status = 'pending' then
    v_cname := trim(coalesce(NEW.first_name,'') || ' ' || coalesce(NEW.last_name,''));
    select name into v_tname from public.teams where id = NEW.team_id;
    perform public.notify_team_reviewers(
      NEW.team_id, 'player_submission_request', NEW.profile_id,
      'player_submission', NEW.id::text,
      jsonb_build_object('candidate_name', v_cname, 'team_name', coalesce(v_tname,''),
                         'team_id', NEW.team_id),
      (NEW.team_id is null));   -- free-agent card → admins + league managers
  end if;
  return null;
exception when others then return null;
end; $$;
drop trigger if exists trg_notify_player_submission_request on public.player_submissions;
create trigger trg_notify_player_submission_request after insert on public.player_submissions
  for each row execute function public.notify_player_submission_request();

-- ---- your proposed player card was approved / rejected ----------------------
create or replace function public.notify_player_submission_decision() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_cname text;
begin
  if NEW.status is distinct from OLD.status and NEW.status in ('approved','rejected') then
    v_cname := trim(coalesce(NEW.first_name,'') || ' ' || coalesce(NEW.last_name,''));
    perform public.create_notification(
      NEW.profile_id,
      case when NEW.status = 'approved' then 'player_submission_approved' else 'player_submission_rejected' end,
      NEW.reviewed_by, 'player', coalesce(NEW.player_id::text, NEW.id::text),
      jsonb_build_object('candidate_name', v_cname, 'player_id', NEW.player_id));
  end if;
  return null;
exception when others then return null;
end; $$;
drop trigger if exists trg_notify_player_submission_decision on public.player_submissions;
create trigger trg_notify_player_submission_decision after update on public.player_submissions
  for each row execute function public.notify_player_submission_decision();

-- ============================================================================
-- 3) MEDICAL CERTIFICATES
-- ============================================================================

-- ---- a player uploaded a medical certificate for review ---------------------
create or replace function public.notify_medical_submitted() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pname text; v_team uuid;
begin
  if NEW.status = 'pending' then
    select trim(coalesce(pl.first_name,'') || ' ' || coalesce(pl.last_name,'')), pl.team_id
      into v_pname, v_team
      from public.players pl where pl.id = NEW.player_id;
    perform public.notify_team_reviewers(
      v_team, 'medical_submitted', NEW.uploaded_by,
      'player', NEW.player_id::text,
      jsonb_build_object('player_name', coalesce(v_pname,''), 'team_id', v_team));
  end if;
  return null;
exception when others then return null;
end; $$;
drop trigger if exists trg_notify_medical_submitted on public.medical_certificates;
create trigger trg_notify_medical_submitted after insert on public.medical_certificates
  for each row execute function public.notify_medical_submitted();

-- ---- your medical certificate was approved / rejected -----------------------
-- Recipient = every profile linked to the player (players.id -> profiles.player_id).
create or replace function public.notify_medical_decision() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pname text;
begin
  if NEW.status is distinct from OLD.status and NEW.status in ('approved','rejected') then
    select trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')) into v_pname
      from public.players where id = NEW.player_id;
    insert into public.notifications(user_id, type, actor_id, entity_type, entity_id, data)
    select pr.id,
           case when NEW.status = 'approved' then 'medical_approved' else 'medical_rejected' end,
           NEW.reviewed_by, 'player', NEW.player_id::text,
           jsonb_build_object('player_name', coalesce(v_pname,''))
    from public.profiles pr
    where pr.player_id = NEW.player_id
      and pr.id <> coalesce(NEW.reviewed_by, '00000000-0000-0000-0000-000000000000'::uuid);
  end if;
  return null;
exception when others then return null;
end; $$;
drop trigger if exists trg_notify_medical_decision on public.medical_certificates;
create trigger trg_notify_medical_decision after update on public.medical_certificates
  for each row execute function public.notify_medical_decision();

-- ============================================================================
-- 4) TOURNAMENT INVITATIONS (tournament_teams)
-- ============================================================================

-- ---- your team was invited to a tournament ----------------------------------
create or replace function public.notify_tournament_invite() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_tname text; v_tourn text;
begin
  if NEW.status = 'invited' then
    select name into v_tname from public.teams where id = NEW.team_id;
    select name into v_tourn from public.tournaments where id = NEW.tournament_id;
    perform public.notify_team_reviewers(
      NEW.team_id, 'tournament_invite', NEW.invited_by,
      'tournament', NEW.tournament_id::text,
      jsonb_build_object('team_name', coalesce(v_tname,''), 'tournament_name', coalesce(v_tourn,''),
                         'team_id', NEW.team_id));
  end if;
  return null;
exception when others then return null;
end; $$;
drop trigger if exists trg_notify_tournament_invite on public.tournament_teams;
create trigger trg_notify_tournament_invite after insert on public.tournament_teams
  for each row execute function public.notify_tournament_invite();

-- ---- an invited team accepted / declined (tell the organizer who invited) ----
create or replace function public.notify_tournament_response() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_tname text; v_tourn text;
begin
  if NEW.status is distinct from OLD.status and NEW.status in ('accepted','declined') then
    select name into v_tname from public.teams where id = NEW.team_id;
    select name into v_tourn from public.tournaments where id = NEW.tournament_id;
    perform public.create_notification(
      NEW.invited_by,
      case when NEW.status = 'accepted' then 'tournament_invite_accepted' else 'tournament_invite_declined' end,
      null, 'tournament', NEW.tournament_id::text,
      jsonb_build_object('team_name', coalesce(v_tname,''), 'tournament_name', coalesce(v_tourn,'')));
  end if;
  return null;
exception when others then return null;
end; $$;
drop trigger if exists trg_notify_tournament_response on public.tournament_teams;
create trigger trg_notify_tournament_response after update on public.tournament_teams
  for each row execute function public.notify_tournament_response();

-- ---- keep the trigger functions off the anon/authenticated RPC surface -------
revoke execute on function public.notify_team_join_request()          from public, anon, authenticated;
revoke execute on function public.notify_team_join_decision()         from public, anon, authenticated;
revoke execute on function public.notify_player_submission_request()  from public, anon, authenticated;
revoke execute on function public.notify_player_submission_decision() from public, anon, authenticated;
revoke execute on function public.notify_medical_submitted()          from public, anon, authenticated;
revoke execute on function public.notify_medical_decision()           from public, anon, authenticated;
revoke execute on function public.notify_tournament_invite()          from public, anon, authenticated;
revoke execute on function public.notify_tournament_response()        from public, anon, authenticated;
