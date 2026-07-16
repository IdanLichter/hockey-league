-- Officials epic (D) — 2026-07-16. Applied to prod via MCP migrations `add_medic_role`
-- and `officials_assignment_and_pay`. Judges + medics: a new medic role, per-game
-- assignment, self-submission with LM approval, and a per-role-rate pay dashboard.

-- ===== D1: medic role (global, mirrors judge/league_manager) =====
alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role in ('player','coach','content_editor','judge','league_manager','medic'));

create or replace function public.is_medic()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'medic');
$$;
revoke all on function public.is_medic() from public, anon;
grant execute on function public.is_medic() to authenticated;

-- ===== D2: game_officials + per-role rates =====
create table if not exists public.game_officials (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('judge','medic')),
  status text not null default 'assigned' check (status in ('assigned','applied','approved','rejected')),
  created_by uuid, reviewed_by uuid, reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (game_id, role, user_id)
);
create index if not exists game_officials_game_idx on public.game_officials(game_id);
create index if not exists game_officials_user_idx on public.game_officials(user_id);
alter table public.game_officials enable row level security;
create policy "read officials admin/lm/self" on public.game_officials
  for select using (public.is_admin() or public.is_league_manager() or user_id = auth.uid());

create table if not exists public.official_rates (
  role text primary key check (role in ('judge','medic')),
  rate numeric not null default 0, updated_at timestamptz not null default now()
);
insert into public.official_rates (role, rate) values ('judge', 0), ('medic', 0) on conflict do nothing;
alter table public.official_rates enable row level security;
create policy "read rates admin/lm" on public.official_rates
  for select using (public.is_admin() or public.is_league_manager());

-- ===== write RPCs (assign / remove / apply / review / set-rate) =====
create or replace function public.assign_official(p_game_id uuid, p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_league_manager()) then raise exception 'not authorized'; end if;
  if p_role not in ('judge','medic') then raise exception 'bad role'; end if;
  insert into public.game_officials (game_id, user_id, role, status, created_by)
    values (p_game_id, p_user_id, p_role, 'assigned', auth.uid())
    on conflict (game_id, role, user_id) do update set status = 'assigned', reviewed_by = auth.uid(), reviewed_at = now();
  perform public.create_notification(p_user_id, 'official_assigned', auth.uid(), 'game', p_game_id::text, jsonb_build_object('role', p_role));
end; $$;

create or replace function public.remove_official(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_league_manager()) then raise exception 'not authorized'; end if;
  delete from public.game_officials where id = p_id;
end; $$;

create or replace function public.apply_as_official(p_game_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_role = 'judge' and not (public.is_admin() or public.is_judge()) then raise exception 'not authorized'; end if;
  if p_role = 'medic' and not (public.is_admin() or public.is_medic()) then raise exception 'not authorized'; end if;
  if p_role not in ('judge','medic') then raise exception 'bad role'; end if;
  insert into public.game_officials (game_id, user_id, role, status, created_by)
    values (p_game_id, auth.uid(), p_role, 'applied', auth.uid())
    on conflict (game_id, role, user_id) do nothing;
  insert into public.notifications (user_id, type, actor_id, entity_type, entity_id, data)
  select distinct u, 'official_application', auth.uid(), 'game', p_game_id::text, jsonb_build_object('role', p_role)
  from ( select ur.user_id as u from public.user_roles ur where ur.role = 'league_manager'
         union
         select usr.id from public.admin_users au join auth.users usr on lower(usr.email) = lower(au.email) ) t(u)
  where u is not null and u <> auth.uid();
end; $$;

create or replace function public.review_official_application(p_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_game uuid; v_role text;
begin
  if not (public.is_admin() or public.is_league_manager()) then raise exception 'not authorized'; end if;
  update public.game_officials
     set status = case when p_approve then 'approved' else 'rejected' end, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id and status = 'applied'
   returning user_id, game_id, role into v_user, v_game, v_role;
  if v_user is not null then
    perform public.create_notification(v_user,
      case when p_approve then 'official_application_approved' else 'official_application_rejected' end,
      auth.uid(), 'game', v_game::text, jsonb_build_object('role', v_role));
  end if;
end; $$;

create or replace function public.set_official_rate(p_role text, p_rate numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_league_manager()) then raise exception 'not authorized'; end if;
  if p_role not in ('judge','medic') then raise exception 'bad role'; end if;
  insert into public.official_rates (role, rate, updated_at) values (p_role, greatest(p_rate,0), now())
    on conflict (role) do update set rate = greatest(p_rate,0), updated_at = now();
end; $$;

-- ===== read RPCs (LM can't read user_roles/officials directly) =====
create or replace function public.list_assignable_officials()
returns table (user_id uuid, display_name text, role text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_league_manager()) then raise exception 'not authorized'; end if;
  return query select ur.user_id, pr.display_name, ur.role
    from public.user_roles ur left join public.profiles pr on pr.id = ur.user_id
    where ur.role in ('judge','medic') order by ur.role, pr.display_name;
end; $$;

create or replace function public.game_officials_overview()
returns table (id uuid, game_id uuid, user_id uuid, display_name text, role text, status text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_league_manager()) then raise exception 'not authorized'; end if;
  return query select go.id, go.game_id, go.user_id, pr.display_name, go.role, go.status
    from public.game_officials go join public.games g on g.id = go.game_id and g.status <> 'completed'
    left join public.profiles pr on pr.id = go.user_id;
end; $$;

create or replace function public.officials_paylog()
returns table (user_id uuid, display_name text, role text, games_worked bigint, rate numeric, total numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_league_manager()) then raise exception 'not authorized'; end if;
  return query select go.user_id, pr.display_name, go.role, count(*)::bigint, coalesce(r.rate,0), (count(*) * coalesce(r.rate,0))
    from public.game_officials go join public.games g on g.id = go.game_id and g.status = 'completed'
    left join public.profiles pr on pr.id = go.user_id left join public.official_rates r on r.role = go.role
    where go.status in ('assigned','approved')
    group by go.user_id, pr.display_name, go.role, r.rate order by pr.display_name, go.role;
end; $$;

revoke all on function public.assign_official(uuid,uuid,text), public.remove_official(uuid),
  public.apply_as_official(uuid,text), public.review_official_application(uuid,boolean),
  public.set_official_rate(text,numeric), public.list_assignable_officials(),
  public.game_officials_overview(), public.officials_paylog() from public, anon;
grant execute on function public.assign_official(uuid,uuid,text), public.remove_official(uuid),
  public.apply_as_official(uuid,text), public.review_official_application(uuid,boolean),
  public.set_official_rate(text,numeric), public.list_assignable_officials(),
  public.game_officials_overview(), public.officials_paylog() to authenticated;
