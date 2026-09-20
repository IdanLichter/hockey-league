-- Admin-initiated user <-> player linking (2026-09-20).
--
-- Until now profiles.player_id could only be set as a REACTION: the user files a
-- player_claims row on a player page and an admin approves it (approve_claim).
-- If a user never files a claim there was no way to attach his account to a card
-- from /admin at all. guard_profile_player_id() already permits an admin (and a
-- league manager) to change player_id — this just gives that permission a door.
--
-- admin_link_player(profile, player) links, admin_link_player(profile, null)
-- unlinks. Both mirror approve_claim: they keep the team-scoped 'player'
-- user_roles row in sync, and resolve a matching pending claim so the queue in
-- the בקשות tab doesn't keep showing a request that is already satisfied.

create or replace function public.admin_link_player(p_profile_id uuid, p_player_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_team  uuid;
  v_owner uuid;
begin
  if not (public.is_admin() or public.is_league_manager()) then
    raise exception 'not authorized';
  end if;
  if p_profile_id is null then
    raise exception 'profile required';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'profile not found';
  end if;

  -- Unlink. Mirrors disconnect_my_pairing(): the player CARD (stats, history)
  -- is untouched, only the account link and the role it granted go away.
  if p_player_id is null then
    update public.profiles set player_id = null where id = p_profile_id;
    delete from public.user_roles where user_id = p_profile_id and role = 'player';
    delete from public.player_claims where profile_id = p_profile_id and status = 'approved';
    return;
  end if;

  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'player not found';
  end if;

  -- profiles.player_id is UNIQUE, so a second account on the same card would
  -- fail with a bare 23505. Raise something the UI can translate instead.
  select id into v_owner from public.profiles where player_id = p_player_id;
  if v_owner is not null and v_owner <> p_profile_id then
    raise exception 'player already linked';
  end if;

  select team_id into v_team from public.players where id = p_player_id;

  update public.profiles set player_id = p_player_id where id = p_profile_id;

  -- Re-linking to a card on another team must not leave the old team-scoped
  -- 'player' row behind, so replace rather than upsert.
  delete from public.user_roles where user_id = p_profile_id and role = 'player';
  insert into public.user_roles (user_id, role, team_id)
    values (p_profile_id, 'player', v_team)
    on conflict (user_id, role, team_id) do nothing;

  update public.player_claims
     set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
   where profile_id = p_profile_id and player_id = p_player_id and status = 'pending';
end;
$$;

revoke execute on function public.admin_link_player(uuid, uuid) from public, anon;
grant execute on function public.admin_link_player(uuid, uuid) to authenticated;
