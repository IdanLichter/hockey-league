-- multi-age-join.sql  (Feature C — additive multi-age membership via request/approve)
-- A paired user requests to join a team; the team's coach (or an admin) approves.
-- CHANGE vs the original 1b flow: approval is now ADDITIVE per age group instead
-- of a single-team replace. Approving a u19 team keeps the player's senior team;
-- only a same-age-group join replaces the existing team in that age group
-- (unique(player_id, age_group) enforces one team per age group). players.team_id
-- stays a "primary" mirror = the senior membership if any, else the joined team
-- (matching setPlayerMemberships' normalization).
--
-- request_team_join / reject_team_join are unchanged (backfilled here from prod for
-- repo reproducibility — they were previously applied via MCP only).

-- ---- request (unchanged; one pending request at a time via a partial unique index) ----
create or replace function public.request_team_join(p_team_id uuid, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_player uuid; v_id uuid;
begin
  select player_id into v_player from public.profiles where id = auth.uid();
  if v_player is null then raise exception 'not a linked player'; end if;
  if not exists (select 1 from public.teams where id = p_team_id and status = 'active') then
    raise exception 'team not found'; end if;
  insert into public.team_join_requests (player_id, team_id, profile_id, note)
    values (v_player, p_team_id, auth.uid(), p_note)
    returning id into v_id;
  return v_id;
end;
$$;

-- ---- approve: ADDITIVE per age group ----
create or replace function public.approve_team_join(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_player uuid; v_team uuid; v_profile uuid; v_status text;
  v_age text; v_prev_team uuid; v_senior_team uuid;
begin
  select player_id, team_id, profile_id, status
    into v_player, v_team, v_profile, v_status
    from public.team_join_requests where id = p_request_id;
  if v_player is null then raise exception 'request not found'; end if;
  if v_status <> 'pending' then raise exception 'request not pending'; end if;
  if not (public.is_admin() or public.is_coach_of(v_team)) then raise exception 'not authorized'; end if;

  -- Age group of the joined team = the "slot" this membership occupies.
  select coalesce(age_group, 'senior') into v_age from public.teams where id = v_team;

  -- Team currently held IN THIS AGE GROUP (if any) — a same-age join replaces it;
  -- memberships in OTHER age groups are left untouched (this is the additive part).
  select team_id into v_prev_team
    from public.player_teams where player_id = v_player and age_group = v_age;

  -- Upsert the age-group membership. The BEFORE trigger derives age_group from the
  -- team, and unique(player_id, age_group) makes this an ADD (new age) or a
  -- same-age SWITCH. Identical on-conflict shape to sync_player_team_from_primary.
  insert into public.player_teams (player_id, team_id) values (v_player, v_team)
    on conflict (player_id, age_group) do update set team_id = excluded.team_id;

  -- Team-scoped 'player' role: drop the replaced same-age team's role, grant the new.
  if v_profile is not null then
    if v_prev_team is not null and v_prev_team <> v_team then
      delete from public.user_roles
        where user_id = v_profile and role = 'player' and team_id = v_prev_team;
    end if;
    insert into public.user_roles (user_id, role, team_id) values (v_profile, 'player', v_team)
      on conflict (user_id, role, team_id) do nothing;
  end if;

  -- Keep players.team_id as the primary mirror = senior membership if any, else the joined team.
  select pt.team_id into v_senior_team
    from public.player_teams pt join public.teams t on t.id = pt.team_id
    where pt.player_id = v_player and coalesce(t.age_group,'senior') = 'senior'
    limit 1;
  update public.players set team_id = coalesce(v_senior_team, v_team) where id = v_player;

  update public.team_join_requests set status='approved', reviewed_at=now(), reviewed_by=auth.uid()
    where id = p_request_id;
end;
$$;

-- ---- reject (unchanged; backfilled for repo) ----
create or replace function public.reject_team_join(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_team uuid; v_status text;
begin
  select team_id, status into v_team, v_status from public.team_join_requests where id = p_request_id;
  if v_team is null then raise exception 'request not found'; end if;
  if not (public.is_admin() or public.is_coach_of(v_team)) then raise exception 'not authorized'; end if;
  update public.team_join_requests set status='rejected', reviewed_at=now(), reviewed_by=auth.uid()
    where id = p_request_id;
end;
$$;

-- ---- leave a SPECIFIC team (multi-age aware). The old leave_team() dropped the
-- primary only; this leaves one age-group membership and re-normalizes the mirror. ----
create or replace function public.leave_team_by_id(p_team_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_player uuid; v_new_primary uuid;
begin
  select player_id into v_player from public.profiles where id = auth.uid();
  if v_player is null then raise exception 'not a linked player'; end if;

  delete from public.player_teams where player_id = v_player and team_id = p_team_id;
  delete from public.user_roles where user_id = auth.uid() and role = 'player' and team_id = p_team_id;

  -- Re-point the primary mirror: prefer a remaining senior team, else any remaining, else free agent.
  select pt.team_id into v_new_primary
    from public.player_teams pt join public.teams t on t.id = pt.team_id
    where pt.player_id = v_player and coalesce(t.age_group,'senior') = 'senior' limit 1;
  if v_new_primary is null then
    select team_id into v_new_primary from public.player_teams where player_id = v_player limit 1;
  end if;
  update public.players set team_id = v_new_primary where id = v_player;
end;
$$;
revoke all on function public.leave_team_by_id(uuid) from public, anon;
grant execute on function public.leave_team_by_id(uuid) to authenticated;
