-- B5: no game signup without a valid medical (2026-07-16). Applied to prod via MCP
-- migration `availability_requires_valid_medical`. Updates set_game_availability from
-- game-availability.sql to reject "available" unless the player holds a valid approved
-- medical certificate (not expired; legacy null-expiry rows grandfathered).
create or replace function public.set_game_availability(p_game_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_player uuid;
begin
  v_player := public.my_player_id();
  if v_player is null then raise exception 'no linked player'; end if;
  if p_status not in ('available','unavailable') then raise exception 'bad status'; end if;
  if p_status = 'available' and not exists (
    select 1 from public.medical_certificates
    where player_id = v_player and status = 'approved'
      and (expires_at is null or expires_at >= current_date)
  ) then
    raise exception 'no valid medical';
  end if;
  insert into public.game_availability (game_id, player_id, status, updated_at)
    values (p_game_id, v_player, p_status, now())
    on conflict (game_id, player_id) do update set status = excluded.status, updated_at = now();
end;
$$;
revoke all on function public.set_game_availability(uuid, text) from public, anon;
grant execute on function public.set_game_availability(uuid, text) to authenticated;
