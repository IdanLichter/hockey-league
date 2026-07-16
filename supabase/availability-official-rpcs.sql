-- C3/C4: officials (judge/admin) read a game's availability so the scoreboard roster
-- can default to confirmed attendees and the referee page can show readiness chips.
-- Availability RLS is coach/admin-only, so these SECURITY DEFINER functions expose just
-- (player_id, status) to admins + judges. Applied to prod via MCP migrations
-- `availability_for_official_rpc` and `availability_for_official_batch_rpc`.

create or replace function public.game_availability_for_official(p_game_id uuid)
returns table (player_id uuid, status text)
language sql stable security definer set search_path = public as $$
  select ga.player_id, ga.status
  from public.game_availability ga
  where ga.game_id = p_game_id
    and (public.is_admin() or public.is_judge())
$$;
revoke all on function public.game_availability_for_official(uuid) from public, anon;
grant execute on function public.game_availability_for_official(uuid) to authenticated;

create or replace function public.game_availability_for_official_batch(p_game_ids uuid[])
returns table (game_id uuid, player_id uuid, status text)
language sql stable security definer set search_path = public as $$
  select ga.game_id, ga.player_id, ga.status
  from public.game_availability ga
  where ga.game_id = any(p_game_ids)
    and (public.is_admin() or public.is_judge())
$$;
revoke all on function public.game_availability_for_official_batch(uuid[]) from public, anon;
grant execute on function public.game_availability_for_official_batch(uuid[]) to authenticated;
