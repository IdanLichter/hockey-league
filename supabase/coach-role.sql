-- Team-scoped coach role.
-- Applied to production 2026-07-10 as migrations:
--   coach_helpers, coach_player_policies, guard_profile_player_id_allow_coach, claim_review_rpcs
--
-- A coach is a `user_roles` row with role='coach' and a team_id. They may manage
-- players on that team, and review player claims for that team. Hiding tabs in
-- Admin.jsx is cosmetic — everything below is the actual trust boundary.

-- ============ HELPERS ============

create or replace function public.is_coach_of(team uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select team is not null and exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'coach'
      and ur.team_id = team
  )
$$;

-- players.id -> game_stats cascades on delete, so removing a player who has
-- played would destroy their historical box scores. Coaches may only delete a
-- player who never appeared in a game.
create or replace function public.player_has_game_stats(p uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.game_stats where player_id = p)
$$;

-- is_coach_of MUST stay anon-executable: the "Coach reads own-team claims" SELECT
-- policy below is evaluated for anonymous readers too, and a policy function runs
-- as the current role. player_has_game_stats is only reachable from the coach
-- DELETE policy, so it is kept off the anonymous API surface.
grant execute on function public.is_coach_of(uuid) to authenticated, anon;
revoke execute on function public.player_has_game_stats(uuid) from public, anon;
grant execute on function public.player_has_game_stats(uuid) to authenticated;

-- ============ PLAYERS: coach writes, scoped to their own team ============
-- Additive PERMISSIVE policies, OR'd with the existing "Admin write players"
-- and "Public read players". Those are untouched.

create policy "Coach insert own-team players" on public.players
  for insert with check (public.is_coach_of(team_id));

-- USING gates the existing row, WITH CHECK gates the resulting row, so a coach
-- can neither touch another team's player nor move one onto another team.
create policy "Coach update own-team players" on public.players
  for update using (public.is_coach_of(team_id))
  with check (public.is_coach_of(team_id));

create policy "Coach delete own-team players" on public.players
  for delete using (
    public.is_coach_of(team_id)
    and not public.player_has_game_stats(id)
  );

-- ============ PLAYER_CLAIMS: coach reads their own team's claims ============
-- No coach UPDATE policy: approve/reject go through the RPCs below.

create policy "Coach reads own-team claims" on public.player_claims
  for select using (
    exists (
      select 1 from public.players pl
      where pl.id = player_claims.player_id
        and public.is_coach_of(pl.team_id)
    )
  );

-- ============ PROFILE PAIRING GUARD ============
-- Amended to let a coach link a profile to a player on their own team (needed by
-- approve_claim). Admins still pass; a user may still self-unlink (set NULL).

create or replace function public.guard_profile_player_id()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.player_id is distinct from old.player_id
     and not public.is_admin()
     and not (new.player_id is null and old.id = auth.uid())
     and not (
       new.player_id is not null
       and public.is_coach_of((select team_id from public.players where id = new.player_id))
     ) then
    raise exception 'player_id can only be changed by an admin';
  end if;
  return new;
end;
$$;

-- ============ CLAIM REVIEW RPCs ============
-- One path for admins and coaches. SECURITY DEFINER so they can write
-- profiles / user_roles / player_claims, but each self-gates on
-- is_admin() OR is_coach_of(<the claimed player's team>).
-- guard_profile_player_id() still fires, which is why it was amended above.

create or replace function public.approve_claim(p_claim_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid;
  v_player  uuid;
  v_team    uuid;
begin
  select profile_id, player_id into v_profile, v_player
    from public.player_claims where id = p_claim_id;
  if v_profile is null then
    raise exception 'claim not found';
  end if;

  select team_id into v_team from public.players where id = v_player;

  if not (public.is_admin() or public.is_coach_of(v_team)) then
    raise exception 'not authorized';
  end if;

  -- profiles.player_id is UNIQUE: raises 23505 if that player is already claimed.
  update public.profiles set player_id = v_player where id = v_profile;

  insert into public.user_roles (user_id, role, team_id)
    values (v_profile, 'player', v_team)
    on conflict (user_id, role, team_id) do nothing;

  update public.player_claims
     set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_claim_id;
end;
$$;

create or replace function public.reject_claim(p_claim_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_team uuid;
begin
  select pl.team_id into v_team
    from public.player_claims c join public.players pl on pl.id = c.player_id
   where c.id = p_claim_id;
  if v_team is null then
    raise exception 'claim not found';
  end if;

  if not (public.is_admin() or public.is_coach_of(v_team)) then
    raise exception 'not authorized';
  end if;

  update public.player_claims
     set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_claim_id;
end;
$$;

revoke all on function public.approve_claim(uuid) from public, anon;
revoke all on function public.reject_claim(uuid) from public, anon;
grant execute on function public.approve_claim(uuid) to authenticated;
grant execute on function public.reject_claim(uuid) to authenticated;
