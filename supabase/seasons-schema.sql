-- ============================================================================
-- Seasons: soft archive by season_id instead of copy-and-delete.
--
-- Replaces archive_and_reset_season(), which copied a lossy, denormalised
-- snapshot into archived_* tables and then DELETEd games + game_stats. That
-- design silently destroyed everything hanging off games (game_videos,
-- game_officials, game_video_markers all cascade), dropped the player_id link
-- on archived box scores, and left champion_team_id pointing at last season's
-- winner.
--
-- Here nothing is ever deleted. Every game carries the season it belongs to,
-- "closing" a season flips a pointer, and RLS hides other seasons from normal
-- clients — so native apps get the filter for free without a rebuild.
--
-- Deliberate scoping decisions:
--   * TOURNAMENTS ARE NOT SEASON-SCOPED. Youth tournaments run on their own
--     timelines while the senior league runs year-round, so tournament games
--     stay visible across a rollover and are governed by their tournament's own
--     dates and status.
--   * teams.wins/points/... and players.goals/... stay as the LIVE season's
--     aggregate. iOS and Android read those columns directly; moving them into
--     per-season tables would break both apps until rebuilt. They are snapshotted
--     into *_season_stats on rollover, then zeroed.
--   * Teams that have ever played keep their delete guard. games.home_team_id
--     is ON DELETE CASCADE, so allowing a team delete would cascade away its
--     historical games. Deactivate via teams.status instead.
--   * THE FEED CARRIES OVER. Posts are stamped with their season but not
--     filtered by it, so the homepage keeps its history across a rollover. Only
--     the generated game-result cards go, because those derive from games.
-- ============================================================================

-- ---------------------------------------------------------------- 1. seasons

create table if not exists public.seasons (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  starts_on  date,
  ends_on    date,
  status     text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now()
);

alter table public.seasons enable row level security;

drop policy if exists "seasons readable by all" on public.seasons;
create policy "seasons readable by all" on public.seasons for select using (true);

drop policy if exists "seasons managed by admin" on public.seasons;
create policy "seasons managed by admin" on public.seasons for all
  using (public.is_admin()) with check (public.is_admin());

-- Seed the season that is already in flight.
insert into public.seasons (name, status) values ('2025-26', 'active')
  on conflict (name) do nothing;

insert into public.league_settings (key, value)
select 'current_season_id', s.id::text from public.seasons s where s.name = '2025-26'
  on conflict (key) do update set value = excluded.value;

-- Pointer to the season the live site is showing. STABLE so it can be used in
-- RLS policies without re-evaluating per row.
create or replace function public.current_season_id()
returns uuid language sql stable security definer set search_path = public as $$
  select nullif(value, '')::uuid from public.league_settings where key = 'current_season_id'
$$;

-- ------------------------------------------------------------ 2. stamp games

alter table public.games add column if not exists season_id uuid references public.seasons(id);
update public.games set season_id = public.current_season_id() where season_id is null;
alter table public.games alter column season_id set default public.current_season_id();
alter table public.games alter column season_id set not null;
create index if not exists games_season_id_idx on public.games (season_id);

-- Posts are stamped with the season they were written in, but deliberately are
-- NOT filtered by it: the feed carries across a rollover as league history. Only
-- the generated game-result cards disappear, because those are derived from
-- games. The column exists so the archive can group posts by season later.
alter table public.posts add column if not exists season_id uuid references public.seasons(id);
update public.posts set season_id = public.current_season_id() where season_id is null;
alter table public.posts alter column season_id set default public.current_season_id();

-- --------------------------------------------------- 3. per-season snapshots

-- Keyed on real team_id/player_id, unlike archived_game_stats which stored only
-- text names and permanently severed the link to the player.
create table if not exists public.team_season_stats (
  id                 uuid primary key default gen_random_uuid(),
  season_id          uuid not null references public.seasons(id) on delete cascade,
  team_id            uuid references public.teams(id) on delete set null,
  team_name          text not null,
  wins               int not null default 0,
  losses             int not null default 0,
  ties               int not null default 0,
  points             int not null default 0,
  goals_for          int not null default 0,
  goals_against      int not null default 0,
  own_goals_received int not null default 0,
  final_rank         int,
  unique (season_id, team_id)
);

create table if not exists public.player_season_stats (
  id            uuid primary key default gen_random_uuid(),
  season_id     uuid not null references public.seasons(id) on delete cascade,
  player_id     uuid references public.players(id) on delete set null,
  first_name    text,
  last_name     text,
  team_id       uuid references public.teams(id) on delete set null,
  team_name     text,
  position      text,
  goals         int not null default 0,
  games_played  int not null default 0,
  blue_cards    int not null default 0,
  red_cards     int not null default 0,
  unique (season_id, player_id)
);

alter table public.team_season_stats   enable row level security;
alter table public.player_season_stats enable row level security;

drop policy if exists "team season stats readable" on public.team_season_stats;
create policy "team season stats readable" on public.team_season_stats for select using (true);
drop policy if exists "team season stats admin write" on public.team_season_stats;
create policy "team season stats admin write" on public.team_season_stats for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "player season stats readable" on public.player_season_stats;
create policy "player season stats readable" on public.player_season_stats for select using (true);
drop policy if exists "player season stats admin write" on public.player_season_stats;
create policy "player season stats admin write" on public.player_season_stats for all
  using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------- 4. season-scope the aggregates

-- Without the season filter this folds every previous season's results into the
-- current standings, because games are no longer deleted on rollover.
create or replace function public.recompute_team_standings(p_team uuid)
returns void language sql volatile security definer set search_path = public as $$
  update public.teams t set
    wins          = s.wins,
    losses        = s.losses,
    ties          = s.ties,
    points        = s.wins * 3 + s.ties,
    goals_for     = s.gf,
    goals_against = s.ga
  from (
    select
      count(*) filter (where (g.home_team_id = p_team and g.home_score > g.away_score)
                          or (g.away_team_id = p_team and g.away_score > g.home_score)) as wins,
      count(*) filter (where (g.home_team_id = p_team and g.home_score < g.away_score)
                          or (g.away_team_id = p_team and g.away_score < g.home_score)) as losses,
      count(*) filter (where g.home_score = g.away_score)                               as ties,
      coalesce(sum(case when g.home_team_id = p_team then g.home_score else g.away_score end), 0) as gf,
      coalesce(sum(case when g.home_team_id = p_team then g.away_score else g.home_score end), 0) as ga
    from public.games g
    where g.status = 'completed'
      and g.game_type <> 'ידידותי'
      and g.tournament_id is null
      and g.season_id = public.current_season_id()   -- <= added
      and g.home_score is not null and g.away_score is not null
      and (g.home_team_id = p_team or g.away_team_id = p_team)
  ) s
  where t.id = p_team;
$$;

-- Same problem with money: pay totals would accumulate across every season.
create or replace function public.officials_paylog()
returns table (user_id uuid, display_name text, role text, games_worked bigint, rate numeric, total numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_league_manager()) then raise exception 'not authorized'; end if;
  return query
    select go.user_id, pr.display_name, go.role, count(*)::bigint as games_worked,
           coalesce(r.rate,0) as rate, (count(*) * coalesce(r.rate,0)) as total
    from public.game_officials go
    join public.games g
      on g.id = go.game_id
     and g.status = 'completed'
     and g.season_id = public.current_season_id()     -- <= added
    left join public.profiles pr on pr.id = go.user_id
    left join public.official_rates r on r.role = go.role
    where go.status in ('assigned','approved')
    group by go.user_id, pr.display_name, go.role, r.rate
    order by pr.display_name, go.role;
end $$;

-- ------------------------------------------------- 5. hide other seasons

-- RESTRICTIVE so it ANDs with the existing permissive policies instead of
-- widening them. Enforced in the database precisely so iOS and Android inherit
-- the filter with no app change — a web-side filter would not reach them.
--
-- Admins and league managers see every season, which is what makes it possible
-- to build next season's calendar before the current one is closed.
drop policy if exists "games current season only" on public.games;
create policy "games current season only" on public.games
  as restrictive for select using (
    season_id = public.current_season_id()
    or tournament_id is not null          -- tournaments run on their own timeline
    or public.is_admin()
    or public.is_league_manager()
  );

drop policy if exists "game stats current season only" on public.game_stats;
create policy "game stats current season only" on public.game_stats
  as restrictive for select using (
    exists (
      select 1 from public.games g
      where g.id = game_stats.game_id
        and (g.season_id = public.current_season_id()
             or g.tournament_id is not null
             or public.is_admin()
             or public.is_league_manager())
    )
  );

-- No season filter on posts by design — see the note above the column.

-- --------------------------------------------------------- 6. close a season

create or replace function public.close_season(p_next_name text, p_next_starts date default null)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_cur uuid; v_next uuid; v_planned uuid;
begin
  if not public.is_admin() then raise exception 'not authorized to close the season'; end if;
  if coalesce(btrim(p_next_name), '') = '' then raise exception 'next season name required'; end if;

  v_cur := public.current_season_id();
  if v_cur is null then raise exception 'no current season configured'; end if;

  -- A season the LM already drafted next year's fixtures into is PROMOTED, not
  -- refused for having a taken name — every drafted game goes live untouched
  -- because nothing is copied or moved. Any other name collision is still an
  -- error.
  select id into v_planned from public.seasons
   where name = btrim(p_next_name) and status = 'planned';

  if v_planned is null and exists (select 1 from public.seasons where name = btrim(p_next_name)) then
    raise exception 'a season named % already exists and is not a planned season', btrim(p_next_name);
  end if;

  -- Snapshot the live aggregates as this season's permanent record.
  insert into public.team_season_stats
    (season_id, team_id, team_name, wins, losses, ties, points,
     goals_for, goals_against, own_goals_received, final_rank)
  select v_cur, t.id, t.name,
         coalesce(t.wins,0), coalesce(t.losses,0), coalesce(t.ties,0), coalesce(t.points,0),
         coalesce(t.goals_for,0), coalesce(t.goals_against,0), coalesce(t.own_goals_received,0),
         row_number() over (order by coalesce(t.points,0) desc,
                                     (coalesce(t.goals_for,0) - coalesce(t.goals_against,0)) desc,
                                     coalesce(t.goals_for,0) desc)
  from public.teams t
  on conflict (season_id, team_id) do update set
    team_name = excluded.team_name, wins = excluded.wins, losses = excluded.losses,
    ties = excluded.ties, points = excluded.points, goals_for = excluded.goals_for,
    goals_against = excluded.goals_against, own_goals_received = excluded.own_goals_received,
    final_rank = excluded.final_rank;

  insert into public.player_season_stats
    (season_id, player_id, first_name, last_name, team_id, team_name, position,
     goals, games_played, blue_cards, red_cards)
  select v_cur, p.id, p.first_name, p.last_name, p.team_id, coalesce(tm.name,''), p.position,
         coalesce(p.goals,0), coalesce(p.games_played,0),
         coalesce(p.blue_cards,0), coalesce(p.red_cards,0)
  from public.players p left join public.teams tm on tm.id = p.team_id
  on conflict (season_id, player_id) do update set
    first_name = excluded.first_name, last_name = excluded.last_name,
    team_id = excluded.team_id, team_name = excluded.team_name, position = excluded.position,
    goals = excluded.goals, games_played = excluded.games_played,
    blue_cards = excluded.blue_cards, red_cards = excluded.red_cards;

  -- Close this season, open the next, and point the site at it.
  update public.seasons
     set status = 'archived', ends_on = coalesce(ends_on, current_date)
   where id = v_cur;

  if v_planned is not null then
    update public.seasons
       set status = 'active',
           starts_on = coalesce(starts_on, p_next_starts, current_date)
     where id = v_planned
    returning id into v_next;
  else
    insert into public.seasons (name, status, starts_on)
    values (btrim(p_next_name), 'active', coalesce(p_next_starts, current_date))
    returning id into v_next;
  end if;

  insert into public.league_settings (key, value, updated_at)
  values ('current_season_id', v_next::text, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();

  -- Reset the live aggregates. Games are NOT deleted; they keep the old
  -- season_id and drop out of the live views on their own.
  --
  -- The `id <> nil-uuid` quals are NOT dead weight: PostgREST sessions preload
  -- the `safeupdate` library (ALTER ROLE authenticator SET
  -- session_preload_libraries), which rejects any UPDATE/DELETE whose PLAN has
  -- no filter with "UPDATE requires a WHERE clause" — 400 at the REST layer.
  -- SECURITY DEFINER does not exempt us: the library is loaded for the session,
  -- not the current_user. `where id is not null` does NOT work, because on
  -- PG17 the planner drops IS NOT NULL quals on NOT NULL columns and the plan
  -- ends up bare again. A sentinel comparison survives planning.
  update public.teams set wins=0, losses=0, ties=0, points=0,
                          goals_for=0, goals_against=0, own_goals_received=0
   where id <> '00000000-0000-0000-0000-000000000000'::uuid;
  update public.players set goals=0, games_played=0, blue_cards=0, red_cards=0
   where id <> '00000000-0000-0000-0000-000000000000'::uuid;

  -- Season-scoped state that should not carry over.
  -- Same safeupdate story — these deletes need a surviving qual too.
  delete from public.player_suspensions     -- bans do not cross seasons
   where id <> '00000000-0000-0000-0000-000000000000'::uuid;
  delete from public.notifications          -- all point at last season's rows
   where id <> '00000000-0000-0000-0000-000000000000'::uuid;
  delete from public.league_settings where key = 'champion_team_id';

  insert into public.league_settings (key, value, updated_at)
  values ('season_mode', 'regular', now())
  on conflict (key) do update set value = 'regular', updated_at = now();

  return v_next;
end $$;

revoke all on function public.close_season(text, date) from public, anon, authenticated;
grant execute on function public.close_season(text, date) to authenticated;

-- ------------------------------------------------- 7. read a past season

-- The archive page needs rows the RLS policy above hides from normal clients.
create or replace function public.season_games(p_season_id uuid)
returns setof public.games language sql stable security definer set search_path = public as $$
  select * from public.games where season_id = p_season_id order by game_date desc
$$;

grant execute on function public.season_games(uuid) to anon, authenticated;

-- --------------------------------------------- 8. retire the old destroyer

create or replace function public.archive_and_reset_season(p_season_name text)
returns uuid language plpgsql as $$
begin
  raise exception
    'archive_and_reset_season is retired — it deleted games and cascaded away game_videos, game_officials and video markers. Use close_season(next_season_name) instead.';
end $$;
