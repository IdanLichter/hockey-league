-- player-teams.sql
-- A player may belong to at most ONE team per age group (the senior league +
-- each youth tournament category). `player_teams` is the source of truth for
-- roster membership. `players.team_id` is kept as a convenience "primary"
-- (senior-preferred) mirror for the many single-team displays that don't care
-- about age groups. `age_group` on each row is derived from the team.
--
-- Applied to production via MCP as migration `player_teams`.

create table if not exists public.player_teams (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references public.players(id) on delete cascade,
  team_id    uuid not null references public.teams(id)   on delete cascade,
  age_group  text not null default 'senior',
  created_at timestamptz not null default now(),
  unique (player_id, age_group),   -- one team per age group per player
  unique (player_id, team_id)      -- no duplicate membership
);
create index if not exists player_teams_team_idx on public.player_teams(team_id);

-- Derive age_group from the team (its primary age_group) on every write, so the
-- unique(player_id, age_group) constraint reliably enforces "one team per age".
create or replace function public.player_teams_set_age_group()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  select coalesce(t.age_group, 'senior') into new.age_group
    from public.teams t where t.id = new.team_id;
  if new.age_group is null then new.age_group := 'senior'; end if;
  return new;
end; $$;
drop trigger if exists trg_player_teams_age on public.player_teams;
create trigger trg_player_teams_age before insert or update of team_id
  on public.player_teams for each row execute function public.player_teams_set_age_group();

-- Keep player_teams in sync whenever players.team_id is written by ANY flow
-- (self-service join approval, submission approval, admin scalar edits). This is
-- UPSERT-ONLY: it adds/replaces the membership in the primary team's age group
-- and never deletes, so multi-age memberships managed elsewhere are preserved.
-- Removals are handled explicitly (leave_team, the admin editor's reconcile).
create or replace function public.sync_player_team_from_primary()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.team_id is not null then
    insert into public.player_teams as pt (player_id, team_id)
      values (new.id, new.team_id)
      on conflict (player_id, age_group)
      do update set team_id = excluded.team_id
      where pt.team_id is distinct from excluded.team_id;
  end if;
  return null;
end; $$;
drop trigger if exists trg_players_sync_membership on public.players;
create trigger trg_players_sync_membership after insert or update of team_id
  on public.players for each row execute function public.sync_player_team_from_primary();

-- These are trigger-only functions; they never need to be RPC-callable.
revoke execute on function public.player_teams_set_age_group() from anon, authenticated;
revoke execute on function public.sync_player_team_from_primary() from anon, authenticated;

-- ----- RLS: public read; admin full; coach for their own team's rows -----
alter table public.player_teams enable row level security;

drop policy if exists "Public read player_teams" on public.player_teams;
create policy "Public read player_teams" on public.player_teams
  for select using (true);

drop policy if exists "Admin write player_teams" on public.player_teams;
create policy "Admin write player_teams" on public.player_teams
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Coach insert own-team membership" on public.player_teams;
create policy "Coach insert own-team membership" on public.player_teams
  for insert with check (public.is_coach_of(team_id));

drop policy if exists "Coach delete own-team membership" on public.player_teams;
create policy "Coach delete own-team membership" on public.player_teams
  for delete using (public.is_coach_of(team_id));

-- ----- Backfill: every current primary team_id becomes a membership row -----
insert into public.player_teams (player_id, team_id)
  select id, team_id from public.players where team_id is not null
  on conflict do nothing;

-- ----- Keep self-service move/leave consistent with memberships -----
-- leave_team: also drop the membership for the team being left.
create or replace function public.leave_team()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_player uuid; v_old_team uuid;
begin
  select player_id into v_player from public.profiles where id = auth.uid();
  if v_player is null then raise exception 'not a linked player'; end if;
  select team_id into v_old_team from public.players where id = v_player;
  update public.players set team_id = null where id = v_player;
  if v_old_team is not null then
    delete from public.user_roles where user_id = auth.uid() and role = 'player' and team_id = v_old_team;
    delete from public.player_teams where player_id = v_player and team_id = v_old_team;
  end if;
end;
$function$;

-- approve_team_join: a self-service move replaces the player's team; drop the
-- old membership (the upsert trigger adds the new one).
create or replace function public.approve_team_join(p_request_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_player uuid; v_team uuid; v_profile uuid; v_status text; v_old_team uuid;
begin
  select player_id, team_id, profile_id, status into v_player, v_team, v_profile, v_status
    from public.team_join_requests where id = p_request_id;
  if v_player is null then raise exception 'request not found'; end if;
  if v_status <> 'pending' then raise exception 'request not pending'; end if;
  if not (public.is_admin() or public.is_coach_of(v_team)) then raise exception 'not authorized'; end if;

  select team_id into v_old_team from public.players where id = v_player;
  if v_old_team is not null and v_old_team <> v_team then
    delete from public.player_teams where player_id = v_player and team_id = v_old_team;
  end if;
  update public.players set team_id = v_team where id = v_player;
  if v_profile is not null then
    if v_old_team is not null and v_old_team <> v_team then
      delete from public.user_roles where user_id = v_profile and role = 'player' and team_id = v_old_team;
    end if;
    insert into public.user_roles (user_id, role, team_id) values (v_profile, 'player', v_team)
      on conflict (user_id, role, team_id) do nothing;
  end if;
  update public.team_join_requests set status='approved', reviewed_at=now(), reviewed_by=auth.uid()
    where id = p_request_id;
end;
$function$;
