-- game-availability.sql
-- Applied to production 2026-07-14 via MCP as migration `game_availability`.
--
-- #3 apply-to-play: a rostered player declares availability (מגיע / לא מגיע) for an
-- upcoming game their team plays; the team's coach (or an admin) sees the roster.
-- Writes go only through set_game_availability() (SECURITY DEFINER, self-scoped via
-- my_player_id()), so a user can never set another player's row.

create table if not exists public.game_availability (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references public.games(id) on delete cascade,
  player_id  uuid not null references public.players(id) on delete cascade,
  status     text not null check (status in ('available','unavailable')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, player_id)
);
create index if not exists game_availability_game_idx on public.game_availability(game_id);

alter table public.game_availability enable row level security;

create or replace function public.my_player_id()
returns uuid language sql stable security definer set search_path = public as $$
  select player_id from public.profiles where id = auth.uid()
$$;
grant execute on function public.my_player_id() to authenticated, anon;

create policy "read availability self/coach/admin" on public.game_availability
  for select using (
    player_id = public.my_player_id()
    or public.is_admin()
    or exists (select 1 from public.players pl
               where pl.id = game_availability.player_id and public.is_coach_of(pl.team_id))
  );

create or replace function public.set_game_availability(p_game_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_player uuid;
begin
  v_player := public.my_player_id();
  if v_player is null then raise exception 'no linked player'; end if;
  if p_status not in ('available','unavailable') then raise exception 'bad status'; end if;
  insert into public.game_availability (game_id, player_id, status, updated_at)
    values (p_game_id, v_player, p_status, now())
    on conflict (game_id, player_id) do update set status = excluded.status, updated_at = now();
end;
$$;
revoke all on function public.set_game_availability(uuid, text) from public, anon;
grant execute on function public.set_game_availability(uuid, text) to authenticated;
