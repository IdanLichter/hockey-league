-- Rollback for coach-role.sql.
-- Run top to bottom. The guard_profile_player_id body below is byte-identical to
-- the one that was live before the coach amendment.

drop policy if exists "Coach insert own-team players" on public.players;
drop policy if exists "Coach update own-team players" on public.players;
drop policy if exists "Coach delete own-team players" on public.players;
drop policy if exists "Coach reads own-team claims" on public.player_claims;

drop function if exists public.approve_claim(uuid);
drop function if exists public.reject_claim(uuid);

-- Restore the pre-coach guard. ClaimsReview must be reverted to its direct-write
-- approve/reject path at the same time, or admin claim approval will break.
create or replace function public.guard_profile_player_id()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.player_id is distinct from old.player_id
     and not public.is_admin()
     and not (new.player_id is null and old.id = auth.uid()) then
    raise exception 'player_id can only be changed by an admin';
  end if;
  return new;
end;
$$;

-- Drop last: the policies above reference these.
drop function if exists public.is_coach_of(uuid);
drop function if exists public.player_has_game_stats(uuid);
