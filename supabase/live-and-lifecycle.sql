-- ============================================================================
-- T3 live game-state broadcast + T2 lifecycle hardening (2026-07-11).
--
-- Model: the judge's device runs the engine (authoritative) and BROADCASTS state
-- changes to one durable row per game. Spectators read the row (public) and tick
-- the clock LOCALLY off the absolute deadline `clock_ends_at`, so we write only on
-- real events (goal/card/start/pause), never per tick, and a late joiner still
-- sees current state. Writes go through gated SECURITY DEFINER RPCs only.
-- ============================================================================

create table if not exists public.live_game_state (
  game_id           uuid primary key references public.games(id) on delete cascade,
  home_score        int not null default 0,
  away_score        int not null default 0,
  clock_ends_at     timestamptz,          -- absolute deadline while running (null when paused)
  clock_remaining_ms int,                 -- frozen remaining when paused
  is_running        boolean not null default false,
  period            text,                 -- current half/period label (e.g. "מחצית 1")
  phase             text,                 -- running | paused | break | over
  state             jsonb not null default '{}'::jsonb,  -- extra: recent events, cards, etc.
  updated_by        uuid references auth.users(id) on delete set null,
  updated_at        timestamptz not null default now()
);

create index if not exists live_game_state_updated_idx on public.live_game_state (updated_at desc);

alter table public.live_game_state enable row level security;

-- Public read: a live score is public info (like the final score). No client
-- writes — the RPCs below are the only way in.
drop policy if exists "public read live game state" on public.live_game_state;
create policy "public read live game state" on public.live_game_state
  for select to anon, authenticated using (true);

do $$ begin
  alter publication supabase_realtime add table public.live_game_state;
exception when others then null; end $$;

-- ---- judge/admin: broadcast a state change ---------------------------------
create or replace function public.broadcast_game_state(
  p_game_id uuid, p_home int, p_away int,
  p_clock_ends_at timestamptz, p_clock_remaining_ms int, p_is_running boolean,
  p_period text, p_phase text, p_state jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_judge()) then raise exception 'not authorized to broadcast'; end if;
  if p_home < 0 or p_away < 0 or p_home > 50 or p_away > 50 then raise exception 'invalid score'; end if;

  insert into public.live_game_state(game_id, home_score, away_score, clock_ends_at, clock_remaining_ms, is_running, period, phase, state, updated_by, updated_at)
  values (p_game_id, p_home, p_away, p_clock_ends_at, p_clock_remaining_ms, coalesce(p_is_running,false), p_period, p_phase, coalesce(p_state,'{}'::jsonb), auth.uid(), now())
  on conflict (game_id) do update set
    home_score = excluded.home_score, away_score = excluded.away_score,
    clock_ends_at = excluded.clock_ends_at, clock_remaining_ms = excluded.clock_remaining_ms,
    is_running = excluded.is_running, period = excluded.period, phase = excluded.phase,
    state = excluded.state, updated_by = excluded.updated_by, updated_at = now();

  -- a broadcast means the game is being officiated → mark it live
  update public.games set status = 'in_progress' where id = p_game_id and status in ('scheduled', 'waiting_result');
end $$;
revoke all    on function public.broadcast_game_state(uuid,int,int,timestamptz,int,boolean,text,text,jsonb) from public, anon;
grant  execute on function public.broadcast_game_state(uuid,int,int,timestamptz,int,boolean,text,text,jsonb) to authenticated;

-- ---- judge/admin: change game status (reset / abandon) ----------------------
-- Answers "a judge started a game and wants to put it back to waiting". Judges
-- can move a game among scheduled/in_progress/waiting_result; only admins may
-- touch a completed game. Resetting to scheduled abandons any live state.
create or replace function public.set_game_status(p_game_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
declare cur text;
begin
  if not (public.is_admin() or public.is_judge()) then raise exception 'not authorized'; end if;
  if p_status not in ('scheduled', 'in_progress', 'waiting_result') then raise exception 'status not settable here'; end if;
  select status into cur from public.games where id = p_game_id;
  if cur is null then raise exception 'game not found'; end if;
  if cur = 'completed' and not public.is_admin() then raise exception 'cannot reopen a completed game'; end if;

  update public.games set status = p_status where id = p_game_id;
  if p_status = 'scheduled' then
    delete from public.live_game_state where game_id = p_game_id;  -- abandon
  end if;
end $$;
revoke all    on function public.set_game_status(uuid,text) from public, anon;
grant  execute on function public.set_game_status(uuid,text) to authenticated;

-- ---- finalize: clear live state when the result is saved --------------------
-- Re-declare judge_save_game_result with the live-state cleanup appended (keeps
-- the input validation added earlier).
create or replace function public.judge_save_game_result(p_game_id uuid, p_home_score integer, p_away_score integer, p_stats jsonb)
returns void
language plpgsql security definer set search_path to 'public' as $$
declare
  g public.games;
  bad int;
begin
  if not (public.is_admin() or public.is_judge()) then raise exception 'not authorized to score games'; end if;
  if p_home_score is null or p_away_score is null or p_home_score < 0 or p_away_score < 0 or p_home_score > 50 or p_away_score > 50 then
    raise exception 'invalid score (must be 0..50)';
  end if;
  select * into g from public.games where id = p_game_id for update;
  if not found then raise exception 'game not found'; end if;
  if g.status = 'completed' then raise exception 'game already completed'; end if;

  select count(*) into bad
  from jsonb_array_elements(coalesce(p_stats, '[]'::jsonb)) r
  where (r->>'player_id') is not null
    and (
      not exists (select 1 from public.players pl where pl.id = (r->>'player_id')::uuid and pl.team_id in (g.home_team_id, g.away_team_id))
      or coalesce((r->>'goals')::int, 0) < 0 or coalesce((r->>'blue_cards')::int, 0) < 0 or coalesce((r->>'red_cards')::int, 0) < 0
    );
  if bad > 0 then raise exception 'box score has % invalid row(s) (player not on either team, or negative count)', bad; end if;

  delete from public.game_stats where game_id = p_game_id;
  insert into public.game_stats (game_id, player_id, goals, blue_cards, red_cards, clean_sheet)
  select p_game_id, (r->>'player_id')::uuid,
         coalesce((r->>'goals')::int, 0), coalesce((r->>'blue_cards')::int, 0),
         coalesce((r->>'red_cards')::int, 0), coalesce((r->>'clean_sheet')::boolean, false)
  from jsonb_array_elements(coalesce(p_stats, '[]'::jsonb)) r
  where (r->>'player_id') is not null;

  update public.games set home_score = p_home_score, away_score = p_away_score, status = 'completed' where id = p_game_id;
  perform public.recompute_team_standings(g.home_team_id);
  perform public.recompute_team_standings(g.away_team_id);

  delete from public.live_game_state where game_id = p_game_id;  -- game over → drop live state
end;
$$;
