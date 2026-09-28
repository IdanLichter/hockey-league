-- Coach "remove from team" = release to free agent, never a hard delete (2026-09-28).
--
-- Why: coaches had a DELETE policy gated on NOT player_has_game_stats(id). A player
-- with any game_stats row matched no policy, so PostgREST returned 204 with ZERO
-- rows deleted and no error — the UI reloaded and the player was simply still there.
-- (Yochay/בלג נוער: 13 of 14 rostered players have stats → first delete worked, the
-- rest silently did nothing.) And deleting a player is wrong for a coach anyway: it
-- would destroy history, their account link, medical file, etc.
--
-- Now: coaches release one membership (their team); the player card survives and
-- becomes a free agent if it has no other team. Hard delete stays admin-only.

create or replace function public.coach_release_player(p_player_id uuid, p_team_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_new_primary uuid;
begin
  if not (public.is_admin() or public.is_coach_of(p_team_id)) then
    raise exception 'not authorized';
  end if;
  if not exists (
    select 1 from public.player_teams where player_id = p_player_id and team_id = p_team_id
    union all
    select 1 from public.players where id = p_player_id and team_id = p_team_id
  ) then
    raise exception 'not on this team';
  end if;

  delete from public.player_teams where player_id = p_player_id and team_id = p_team_id;
  -- The linked account loses its team-scoped player role for this team only.
  delete from public.user_roles ur
    using public.profiles pr
    where pr.player_id = p_player_id and ur.user_id = pr.id
      and ur.role = 'player' and ur.team_id = p_team_id;
  -- Drop any pending join request to this same team so it can't silently re-add them.
  delete from public.team_join_requests
    where player_id = p_player_id and team_id = p_team_id and status = 'pending';

  -- Re-point the primary mirror (same rule as leave_team_by_id): a remaining senior
  -- team, else any remaining team, else NULL = free agent.
  select pt.team_id into v_new_primary
    from public.player_teams pt join public.teams t on t.id = pt.team_id
    where pt.player_id = p_player_id and coalesce(t.age_group,'senior') = 'senior' limit 1;
  if v_new_primary is null then
    select team_id into v_new_primary from public.player_teams where player_id = p_player_id limit 1;
  end if;
  update public.players set team_id = v_new_primary where id = p_player_id;
end;
$$;
revoke all on function public.coach_release_player(uuid, uuid) from public, anon;
grant execute on function public.coach_release_player(uuid, uuid) to authenticated;

-- Coaches no longer hard-delete player cards (admin keeps "Admin write players").
drop policy if exists "Coach delete own-team players" on public.players;
