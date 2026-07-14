-- player-submissions.sql
-- Applied to production 2026-07-14 via MCP as migration `player_submissions`.
--
-- Self-service player cards (#7). A logged-in user proposes a NEW player card
-- for a team; the team's coach (or an admin) approves via the
-- approve_player_submission RPC, which creates the real players row, links the
-- submitter's profile, and grants the team-scoped 'player' role. Mirrors the
-- player_claims flow (coach-role.sql) but for players that don't exist yet, so
-- unapproved cards never appear in the public players table.

create table if not exists public.player_submissions (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  team_id       uuid not null references public.teams(id) on delete cascade,
  first_name    text not null,
  last_name     text not null,
  jersey_number integer,
  position      text,
  age           integer,
  photo_url     text,
  note          text,
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  player_id     uuid references public.players(id) on delete set null,
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz,
  reviewed_by   uuid
);

create index if not exists player_submissions_team_id_idx on public.player_submissions(team_id);
create index if not exists player_submissions_profile_id_idx on public.player_submissions(profile_id);
-- one open submission per user at a time
create unique index if not exists player_submissions_one_pending_per_profile
  on public.player_submissions(profile_id) where status = 'pending';

alter table public.player_submissions enable row level security;

create policy "User inserts own pending submission" on public.player_submissions
  for insert with check (profile_id = auth.uid() and status = 'pending');
create policy "Read own submissions or admin" on public.player_submissions
  for select using (profile_id = auth.uid() or public.is_admin());
create policy "Coach reads own-team submissions" on public.player_submissions
  for select using (public.is_coach_of(team_id));
create policy "User cancels own pending submission" on public.player_submissions
  for delete using ((profile_id = auth.uid() and status = 'pending') or public.is_admin());
create policy "Admin updates submissions" on public.player_submissions
  for update using (public.is_admin()) with check (public.is_admin());

-- ===== approve / reject RPCs (self-gated to admin OR coach-of-team) =====

create or replace function public.approve_player_submission(p_submission_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid; v_team uuid; v_status text; v_player uuid;
  v_first text; v_last text; v_jersey integer; v_pos text; v_age integer; v_photo text;
begin
  select profile_id, team_id, status, first_name, last_name, jersey_number, position, age, photo_url
    into v_profile, v_team, v_status, v_first, v_last, v_jersey, v_pos, v_age, v_photo
    from public.player_submissions where id = p_submission_id;
  if v_profile is null then raise exception 'submission not found'; end if;
  if v_status <> 'pending' then raise exception 'submission not pending'; end if;
  if not (public.is_admin() or public.is_coach_of(v_team)) then raise exception 'not authorized'; end if;

  insert into public.players (first_name, last_name, jersey_number, position, age, photo_url, team_id)
    values (v_first, v_last, v_jersey, v_pos, v_age, v_photo, v_team)
    returning id into v_player;

  -- link the submitter only if not already linked (profiles.player_id is UNIQUE).
  -- guard_profile_player_id() permits this: the reviewer is admin or coach-of-team.
  update public.profiles set player_id = v_player
    where id = v_profile and player_id is null;

  insert into public.user_roles (user_id, role, team_id)
    values (v_profile, 'player', v_team)
    on conflict (user_id, role, team_id) do nothing;

  update public.player_submissions
     set status = 'approved', player_id = v_player, reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_submission_id;

  return v_player;
end;
$$;

create or replace function public.reject_player_submission(p_submission_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_team uuid; v_status text;
begin
  select team_id, status into v_team, v_status
    from public.player_submissions where id = p_submission_id;
  if v_team is null then raise exception 'submission not found'; end if;
  if not (public.is_admin() or public.is_coach_of(v_team)) then raise exception 'not authorized'; end if;
  update public.player_submissions
     set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_submission_id;
end;
$$;

revoke all on function public.approve_player_submission(uuid) from public, anon;
revoke all on function public.reject_player_submission(uuid) from public, anon;
grant execute on function public.approve_player_submission(uuid) to authenticated;
grant execute on function public.reject_player_submission(uuid) to authenticated;
