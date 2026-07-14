-- user-created-teams.sql  (Package 1a)
-- Applied to production 2026-07-14 via MCP as migration `user_created_teams`.
--
-- A linked player proposes a team (pending) → a league-manager/admin approves →
-- it goes active and the creator becomes its coach. Teams gain status +
-- created_by + a multi-value age_groups array; city is relaxed to optional.
-- Existing teams default to 'active' so nothing changes for them. Writes go
-- through SECURITY DEFINER RPCs (teams RLS is admin-write only), mirroring the
-- tournament request→review flow.

alter table public.teams add column if not exists status text not null default 'active'
  check (status in ('pending','active','rejected'));
alter table public.teams add column if not exists created_by uuid;
alter table public.teams add column if not exists age_groups text[];
update public.teams set age_groups = array[coalesce(age_group,'senior')] where age_groups is null;
alter table public.teams alter column age_groups set default array['senior']::text[];
alter table public.teams alter column age_groups set not null;
alter table public.teams alter column city drop not null;

create or replace function public.is_linked_player()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and player_id is not null)
$$;
revoke all on function public.is_linked_player() from public, anon;
grant execute on function public.is_linked_player() to authenticated;

create or replace function public.request_team(p_name text, p_age_groups text[], p_city text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_groups text[];
begin
  if not public.is_linked_player() then raise exception 'not a linked player'; end if;
  if p_name is null or length(btrim(p_name)) = 0 then raise exception 'name required'; end if;
  v_groups := coalesce(nullif(p_age_groups, '{}'::text[]), array['senior']);
  if exists (select 1 from unnest(v_groups) g where g not in ('senior','u19','u17','u15')) then
    raise exception 'invalid age group';
  end if;
  insert into public.teams (name, city, age_group, age_groups, status, created_by)
    values (btrim(p_name), nullif(btrim(coalesce(p_city,'')), ''), v_groups[1], v_groups, 'pending', auth.uid())
    returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.request_team(text, text[], text) from public, anon;
grant execute on function public.request_team(text, text[], text) to authenticated;

create or replace function public.review_team(p_team_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_creator uuid; v_status text;
begin
  if not (public.is_admin() or public.is_league_manager()) then raise exception 'not authorized'; end if;
  select created_by, status into v_creator, v_status from public.teams where id = p_team_id;
  if v_status is null then raise exception 'team not found'; end if;
  if p_approve then
    update public.teams set status = 'active' where id = p_team_id;
    if v_creator is not null then
      insert into public.user_roles (user_id, role, team_id)
        values (v_creator, 'coach', p_team_id)
        on conflict (user_id, role, team_id) do nothing;
    end if;
  else
    update public.teams set status = 'rejected' where id = p_team_id;
  end if;
end;
$$;
revoke all on function public.review_team(uuid, boolean) from public, anon;
grant execute on function public.review_team(uuid, boolean) to authenticated;
