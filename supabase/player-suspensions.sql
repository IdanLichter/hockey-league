-- player-suspensions.sql (P0 — 2026-08-02)
-- Applied to production via MCP as migration `player_suspensions`.
--
-- The serve trigger was verified end-to-end on 2026-08-02 against a synthetic game
-- inside an aborting transaction: a block from an earlier incident went 1 → 0 and
-- cleared itself; a block whose card was shown in that same game stayed at 1.
--
-- Red-card block. Sheet rows 5 (שחקן שלא מצליח להרשם בגלל כרטיס אדום) and
-- 15 (חוסר אפשרות להוסיף שחקן עם כרטיס אדום).
--
-- Deliberately NOT derived from game_stats.red_cards. Per the product decision: the
-- card is issued MANUALLY — by the judge in the game engine, or by the league manager
-- afterwards — and it blocks one game. Serving is then automatic: when a game the
-- player's team plays completes, the counter drops; at zero the block clears itself,
-- so nobody has to remember to lift it.

create table if not exists public.player_suspensions (
  id              uuid primary key default gen_random_uuid(),
  player_id       uuid not null references public.players(id) on delete cascade,
  -- the game the card was shown in; it must not count as the game served
  issued_game_id  uuid references public.games(id) on delete set null,
  reason          text,
  games_remaining int not null default 1 check (games_remaining >= 0),
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  cleared_at      timestamptz
);

create index if not exists player_suspensions_active_idx
  on public.player_suspensions(player_id) where cleared_at is null;
create index if not exists player_suspensions_player_idx
  on public.player_suspensions(player_id);
create index if not exists player_suspensions_issued_game_idx
  on public.player_suspensions(issued_game_id);

alter table public.player_suspensions enable row level security;

-- The player himself, his coach, and managers can see the block (he must be told WHY
-- he cannot register). Nobody writes directly — all writes go through the RPCs below.
drop policy if exists "read suspensions self/coach/manager" on public.player_suspensions;
create policy "read suspensions self/coach/manager" on public.player_suspensions
  for select using (
    player_id = public.my_player_id()
    or public.is_admin()
    or public.is_league_manager()
    or exists (
      select 1 from public.players pl
      where pl.id = player_suspensions.player_id and public.is_coach_of(pl.team_id)
    )
    or exists (
      select 1 from public.player_teams pt
      where pt.player_id = player_suspensions.player_id and public.is_coach_of(pt.team_id)
    )
  );

-- Is this player currently blocked? Used by the registration gates in P1.
create or replace function public.is_suspended(p_player uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.player_suspensions
    where player_id = p_player and cleared_at is null and games_remaining > 0
  )
$$;
grant execute on function public.is_suspended(uuid) to authenticated;

-- The active block for a player, with its reason → so the UI can explain the refusal
-- instead of just failing.
create or replace function public.active_suspension(p_player uuid)
returns table (id uuid, reason text, games_remaining int, issued_game_id uuid, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.reason, s.games_remaining, s.issued_game_id, s.created_at
  from public.player_suspensions s
  where s.player_id = p_player and s.cleared_at is null and s.games_remaining > 0
  order by s.created_at desc
  limit 1
$$;
grant execute on function public.active_suspension(uuid) to authenticated;

-- Issue a block. Judge (from the game engine, mid-game) or admin / league manager.
create or replace function public.issue_suspension(
  p_player uuid,
  p_game   uuid default null,
  p_reason text default null,
  p_games  int  default 1
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not (public.is_admin() or public.is_league_manager() or public.is_judge()) then
    raise exception 'not authorized';
  end if;
  if p_games < 1 then
    raise exception 'games must be at least 1';
  end if;
  if not exists (select 1 from public.players where id = p_player) then
    raise exception 'player not found';
  end if;
  insert into public.player_suspensions (player_id, issued_game_id, reason, games_remaining, created_by)
  values (p_player, p_game, nullif(btrim(coalesce(p_reason, '')), ''), p_games, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.issue_suspension(uuid, uuid, text, int) from public, anon;
grant execute on function public.issue_suspension(uuid, uuid, text, int) to authenticated;

-- Lift a block early (league manager's call — e.g. the card was given in error).
create or replace function public.clear_suspension(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_league_manager()) then
    raise exception 'not authorized';
  end if;
  update public.player_suspensions
     set cleared_at = now(), games_remaining = 0
   where id = p_id and cleared_at is null;
end;
$$;
revoke all on function public.clear_suspension(uuid) from public, anon;
grant execute on function public.clear_suspension(uuid) to authenticated;

-- Serving the block: when a game completes, every blocked player whose team played in
-- it burns one game. The game the card was SHOWN in is excluded — he was on the pitch
-- for that one, so it cannot also be the game he sat out.
-- Team membership is checked against player_teams (the roster source of truth for
-- multi-age players) as well as players.team_id (the derived primary).
create or replace function public.serve_suspensions_on_game_complete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and coalesce(old.status, '') <> 'completed' then
    update public.player_suspensions s
       set games_remaining = s.games_remaining - 1,
           cleared_at = case when s.games_remaining - 1 <= 0 then now() else null end
     where s.cleared_at is null
       and s.games_remaining > 0
       and s.issued_game_id is distinct from new.id
       and (
         exists (
           select 1 from public.players p
           where p.id = s.player_id
             and p.team_id in (new.home_team_id, new.away_team_id)
         )
         or exists (
           select 1 from public.player_teams pt
           where pt.player_id = s.player_id
             and pt.team_id in (new.home_team_id, new.away_team_id)
         )
       );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_serve_suspensions on public.games;
create trigger trg_serve_suspensions
  after update of status on public.games
  for each row execute function public.serve_suspensions_on_game_complete();
