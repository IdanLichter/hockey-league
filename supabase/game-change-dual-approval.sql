-- Game-change dual approval + multi-date (#2/#5) — 2026-07-17. Applied to prod via MCP
-- migration `game_change_dual_approval`. Extends supabase/game-change-requests.sql.
--
-- Flow: coach A proposes up to 3 dates + a venue → 'pending_opponent' (or straight to
-- 'pending_manager' if the opponent team has no coach) → the opposing coach ticks the
-- workable date(s) or rejects → 'pending_manager' → league manager finalizes ONE date
-- and it's applied to the game. Reject at any stage ends it.

alter table public.game_change_requests
  add column if not exists proposed_dates jsonb,
  add column if not exists opponent_dates jsonb,
  add column if not exists opponent_by uuid,
  add column if not exists opponent_at timestamptz,
  add column if not exists chosen_date timestamptz;

alter table public.game_change_requests drop constraint if exists game_change_requests_status_check;
alter table public.game_change_requests add constraint game_change_requests_status_check
  check (status in ('pending','pending_opponent','pending_manager','approved','rejected','cancelled'));

drop index if exists game_change_requests_one_pending_per_game;
create unique index if not exists game_change_requests_one_open_per_game
  on public.game_change_requests(game_id)
  where status in ('pending','pending_opponent','pending_manager');

create or replace function public._gc_opponent(p_game uuid, p_team uuid)
returns uuid language sql stable set search_path = public as $$
  select case when g.home_team_id = p_team then g.away_team_id else g.home_team_id end
  from public.games g where g.id = p_game
$$;

drop function if exists public.request_game_change(uuid, timestamptz, text, text);
create or replace function public.request_game_change(p_game_id uuid, p_dates jsonb, p_venue text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_home uuid; v_away uuid; v_status text; v_team uuid; v_opp uuid; v_opp_has_coach boolean; v_orig_date timestamptz; v_orig_venue text;
begin
  select home_team_id, away_team_id, status, game_date, venue into v_home, v_away, v_status, v_orig_date, v_orig_venue
    from public.games where id = p_game_id;
  if v_home is null then raise exception 'not found'; end if;
  if v_status not in ('scheduled','postponed') then raise exception 'game must be scheduled or postponed'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'reason is required'; end if;
  if (p_dates is null or jsonb_array_length(p_dates) = 0) and coalesce(trim(p_venue),'') = '' then raise exception 'propose a new date or venue'; end if;
  if public.is_coach_of(v_home) then v_team := v_home; elsif public.is_coach_of(v_away) then v_team := v_away;
  else raise exception 'only a coach of one of the teams may request a change'; end if;
  v_opp := public._gc_opponent(p_game_id, v_team);
  v_opp_has_coach := exists (select 1 from public.user_roles where role='coach' and team_id=v_opp);
  v_status := case when v_opp_has_coach then 'pending_opponent' else 'pending_manager' end;
  insert into public.game_change_requests
    (game_id, requested_by, team_id, proposed_dates, proposed_venue, reason, original_date, original_venue, status)
  values (p_game_id, auth.uid(), v_team, p_dates, nullif(trim(p_venue),''), trim(p_reason), v_orig_date, v_orig_venue, v_status);
  if v_status = 'pending_opponent' then
    perform public.notify_team_reviewers(v_opp, 'game_change_opponent', auth.uid(), 'game', p_game_id::text, jsonb_build_object('reason', trim(p_reason)), false);
  else
    insert into public.notifications (user_id, type, actor_id, entity_type, entity_id, data)
    select distinct u, 'game_change_request', auth.uid(), 'game', p_game_id::text, jsonb_build_object('reason', trim(p_reason))
    from (select ur.user_id u from public.user_roles ur where ur.role='league_manager'
          union select usr.id from public.admin_users au join auth.users usr on lower(usr.email)=lower(au.email)) t(u)
    where u is not null and u <> auth.uid();
  end if;
end; $$;

create or replace function public.respond_game_change_opponent(p_id uuid, p_agree_dates jsonb, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_game uuid; v_team uuid; v_opp uuid; v_req uuid;
begin
  select game_id, team_id, requested_by into v_game, v_team, v_req from public.game_change_requests where id = p_id and status = 'pending_opponent';
  if v_game is null then raise exception 'not found'; end if;
  v_opp := public._gc_opponent(v_game, v_team);
  if not (public.is_admin() or public.is_coach_of(v_opp)) then raise exception 'not authorized'; end if;
  if p_approve then
    update public.game_change_requests set status='pending_manager', opponent_dates = p_agree_dates, opponent_by = auth.uid(), opponent_at = now() where id = p_id;
    insert into public.notifications (user_id, type, actor_id, entity_type, entity_id, data)
    select distinct u, 'game_change_request', auth.uid(), 'game', v_game::text, '{}'::jsonb
    from (select ur.user_id u from public.user_roles ur where ur.role='league_manager'
          union select usr.id from public.admin_users au join auth.users usr on lower(usr.email)=lower(au.email)) t(u)
    where u is not null;
  else
    update public.game_change_requests set status='rejected', opponent_by = auth.uid(), opponent_at = now() where id = p_id;
    perform public.create_notification(v_req, 'game_change_rejected', auth.uid(), 'game', v_game::text, jsonb_build_object('by','opponent'));
  end if;
end; $$;

create or replace function public.finalize_game_change(p_id uuid, p_chosen_date timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare v_row public.game_change_requests; v_opp uuid;
begin
  if not (public.is_admin() or public.is_league_manager()) then raise exception 'not authorized'; end if;
  select * into v_row from public.game_change_requests where id = p_id and status = 'pending_manager' for update;
  if v_row.id is null then raise exception 'not found'; end if;
  if v_row.proposed_dates is not null and jsonb_array_length(v_row.proposed_dates) > 0 then
    if p_chosen_date is null then raise exception 'choose a date'; end if;
    if not exists (select 1 from jsonb_array_elements_text(coalesce(v_row.opponent_dates, v_row.proposed_dates)) d where d::timestamptz = p_chosen_date) then
      raise exception 'chosen date not among the agreed options'; end if;
  end if;
  update public.games set game_date = coalesce(p_chosen_date, game_date), venue = coalesce(v_row.proposed_venue, venue) where id = v_row.game_id;
  update public.game_change_requests set status='approved', chosen_date = p_chosen_date, reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  perform public.create_notification(v_row.requested_by, 'game_change_approved', auth.uid(), 'game', v_row.game_id::text, '{}'::jsonb);
  v_opp := public._gc_opponent(v_row.game_id, v_row.team_id);
  perform public.notify_team_reviewers(v_opp, 'game_change_approved', auth.uid(), 'game', v_row.game_id::text, '{}'::jsonb, false);
end; $$;

revoke all on function public.request_game_change(uuid,jsonb,text,text), public.respond_game_change_opponent(uuid,jsonb,boolean), public.finalize_game_change(uuid,timestamptz) from public, anon;
grant execute on function public.request_game_change(uuid,jsonb,text,text), public.respond_game_change_opponent(uuid,jsonb,boolean), public.finalize_game_change(uuid,timestamptz) to authenticated;
