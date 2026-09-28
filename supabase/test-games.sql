-- Hidden test games (2026-09-28)
--
-- There is only ONE database, so every test ran against real users: a test live game
-- pushed goal alerts, opened a הוקי מרקט market, reminded coaches and league managers.
-- This adds a sandbox INSIDE production: two test teams, and any game between them is a
-- test game that only admins can see and that never reaches anybody else.
--
--   teams.is_test  — set by hand (the two teams seeded below).
--   games.is_test  — DERIVED by trigger from the two teams; clients can't set it. A game
--                    mixing a test team with a real team is refused, since the real side's
--                    players/followers would get the notifications.
--
-- Hidden from everyone but admins (restrictive RLS, so web + iOS + Android + api/*.js
-- + Realtime all obey it): test teams, test games, and their live state, stats,
-- videos, markers and markets.
-- Server paths that bypass RLS (security definer / service role) are guarded here:
-- notifications (dropped at insert — covers every trigger, reminder and push),
-- markets, reminders, suspensions, standings, officials pay, season_games RPCs.
-- Outside SQL: weekly-preview edge fn + the season fixture generator skip is_test.
--
-- Rollback: test-games-down.sql

alter table public.teams add column if not exists is_test boolean not null default false;
alter table public.games add column if not exists is_test boolean not null default false;

-- ---------------------------------------------------------------------------
-- games.is_test follows its teams.
create or replace function public.games_derive_is_test()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare h boolean; a boolean;
begin
  select coalesce(is_test, false) into h from public.teams where id = new.home_team_id;
  select coalesce(is_test, false) into a from public.teams where id = new.away_team_id;
  h := coalesce(h, false); a := coalesce(a, false);
  if new.home_team_id is not null and new.away_team_id is not null and h <> a then
    raise exception 'משחק בדיקה חייב להיות בין שתי קבוצות בדיקה' using errcode = 'check_violation';
  end if;
  new.is_test := h or a;
  return new;
end $$;

drop trigger if exists trg_games_derive_is_test on public.games;
create trigger trg_games_derive_is_test
  before insert or update on public.games
  for each row execute function public.games_derive_is_test();

create or replace function public.is_test_game(p_game uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$ select coalesce((select is_test from public.games where id = p_game), false) $$;

create or replace function public.can_see_test()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$ select coalesce(public.is_admin(), false) $$;

-- ---------------------------------------------------------------------------
-- Visibility: restrictive policies AND with the existing permissive ones.
drop policy if exists "hide test teams" on public.teams;
create policy "hide test teams" on public.teams as restrictive for select
  using (not is_test or (select public.can_see_test()));

drop policy if exists "hide test games" on public.games;
create policy "hide test games" on public.games as restrictive for select
  using (not is_test or (select public.can_see_test()));

do $$
declare t text;
begin
  foreach t in array array['live_game_state','game_stats','game_videos','markets','game_availability','game_officials'] loop
    execute format('drop policy if exists "hide test games" on public.%I', t);
    execute format(
      'create policy "hide test games" on public.%I as restrictive for select
         using (game_id is null or not public.is_test_game(game_id) or (select public.can_see_test()))', t);
  end loop;
end $$;

drop policy if exists "hide test games" on public.game_video_markers;
create policy "hide test games" on public.game_video_markers as restrictive for select
  using (not exists (select 1 from public.game_videos v
                      where v.id = game_video_markers.video_ref and public.is_test_game(v.game_id))
         or (select public.can_see_test()));

-- ---------------------------------------------------------------------------
-- Notifications: one choke point. Every notification about a game (goal, result,
-- moved, reminders, coach/LM digests, availability, change requests, broadcasts) is
-- inserted here, and send-push fires off these rows — so dropping them silences push too.
create or replace function public.notifications_skip_test_games()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.entity_type = 'game'
     and new.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and public.is_test_game(new.entity_id::uuid) then
    return null;
  end if;
  return new;
end $$;

drop trigger if exists trg_notifications_skip_test_games on public.notifications;
create trigger trg_notifications_skip_test_games
  before insert on public.notifications
  for each row execute function public.notifications_skip_test_games();

-- ---------------------------------------------------------------------------
-- Markets: a test fixture never gets a betting market.
create or replace function public.market_games_after_insert()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.status = 'scheduled' and new.game_date > now() and not new.is_test
     and new.home_team_id is not null and new.away_team_id is not null then
    perform market_create_for_game(new.id);
  end if;
  return null;
end $function$;

create or replace function public.market_games_after_update()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_market uuid; v_status text; v_win uuid;
begin
  if new.is_test then return null; end if;
  select id, status into v_market, v_status from markets where game_id = new.id;
  if v_market is null then
    -- A fixture pushed back into the future (or un-cancelled) deserves a market.
    if new.status = 'scheduled' and new.game_date > now()
       and new.home_team_id is not null and new.away_team_id is not null then
      perform market_create_for_game(new.id);
    end if;
    return null;
  end if;

  -- A rescheduled fixture drags its deadline with it, in both directions: a game
  -- moved later must re-open a market that time had already closed, or the new
  -- window is dead for betting.
  if new.game_date is distinct from old.game_date and v_status in ('open','closed') then
    update markets set closes_at = new.game_date,
           status = case when new.game_date > now() then 'open' else 'closed' end
     where id = v_market;
    v_status := case when new.game_date > now() then 'open' else 'closed' end;
  end if;

  if new.status = 'completed' and v_status in ('open','closed')
     and new.home_score is not null and new.away_score is not null then
    -- Same rule the standings use: own goals are already inside the scores.
    select id into v_win from market_outcomes
     where market_id = v_market
       and okey = case when new.home_score > new.away_score then 'home'
                       when new.home_score < new.away_score then 'away'
                       else 'draw' end;
    if v_win is not null then perform market_settle(v_market, v_win, 'נסגר לפי התוצאה הסופית'); end if;

  elsif new.status = 'cancelled' and v_status in ('open','closed') then
    perform market_void(v_market, 'המשחק בוטל — כל המטבעות הוחזרו');

  elsif new.status <> 'scheduled' and v_status = 'open' then
    update markets set status = 'closed' where id = v_market;
  end if;
  return null;
end $function$;

create or replace function public.market_sync_games()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare n int := 0; r record;
begin
  if not (coalesce(is_admin(), false) or coalesce(is_league_manager(), false)) then
    raise exception 'market: not authorized' using errcode = 'insufficient_privilege';
  end if;
  for r in select g.id from games g
            where g.status = 'scheduled' and g.game_date > now() and not g.is_test
              and g.home_team_id is not null and g.away_team_id is not null
              and not exists (select 1 from markets m where m.game_id = g.id)
  loop
    perform market_create_for_game(r.id);
    n := n + 1;
  end loop;
  return n;
end $function$;

-- ---------------------------------------------------------------------------
-- Reminders (the notification guard would drop them anyway; this also keeps
-- game_reminder_log clean).
create or replace function public.run_game_reminders()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_now    timestamptz := now();
  v_sent   int := 0;
  g        record;
  rule     record;
  d        int;
  v_target timestamptz;
begin
  for g in
    select id, game_date from public.games
     where status in ('scheduled', 'postponed')
       and not is_test
       and game_date > v_now
       and game_date < v_now + interval '30 days'
  loop
    for rule in select * from public.notification_rules where enabled loop
      for d in select generate_series(case when rule.repeats then 1 else rule.days_before end,
                                      rule.days_before)
      loop
        v_target := (((g.game_date at time zone 'Asia/Jerusalem')::date - d)
                     + make_interval(hours => rule.hour_local)) at time zone 'Asia/Jerusalem';
        if date_trunc('hour', v_target) = date_trunc('hour', v_now)
           -- Repeating rules stay excluded from catch-up: otherwise a late or moved
           -- fixture would fire one nudge per missed day all at once.
           or (not rule.repeats and v_target < v_now)
        then
          v_sent := v_sent + public.send_game_reminder(
            rule.kind, g.id, (v_target at time zone 'Asia/Jerusalem')::date);
        end if;
      end loop;
    end loop;
  end loop;
  return v_sent;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Suspensions: completing a test game never counts as a served game.
create or replace function public.serve_suspensions_on_game_complete()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.is_test then return new; end if;
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
$function$;

-- ---------------------------------------------------------------------------
-- Standings / officials pay / season lists (security definer — RLS doesn't apply).
create or replace function public.recompute_team_standings(p_team uuid)
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
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
      and g.game_type = 'ליגה'
      and g.tournament_id is null
      and not g.is_test
      and g.season_id = public.current_season_id()
      and g.home_score is not null and g.away_score is not null
      and (g.home_team_id = p_team or g.away_team_id = p_team)
  ) s
  where t.id = p_team;
$function$;

create or replace function public.officials_paylog()
 returns table(user_id uuid, display_name text, role text, games_worked bigint, rate numeric, total numeric)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if not (public.is_admin() or public.is_league_manager()) then raise exception 'not authorized'; end if;
  return query
    select go.user_id, pr.display_name, go.role, count(*)::bigint as games_worked,
           coalesce(r.rate,0) as rate, (count(*) * coalesce(r.rate,0)) as total
    from public.game_officials go
    join public.games g
      on g.id = go.game_id
     and g.status = 'completed'
     and not g.is_test
     and g.season_id = public.current_season_id()
    left join public.profiles pr on pr.id = go.user_id
    left join public.official_rates r on r.role = go.role
    where go.status in ('assigned','approved')
    group by go.user_id, pr.display_name, go.role, r.rate
    order by pr.display_name, go.role;
end $function$;

create or replace function public.season_games(p_season_id uuid)
 returns setof games
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select * from public.games
   where season_id = p_season_id
     and (not is_test or public.can_see_test())
   order by game_date desc
$function$;

create or replace function public.season_games_detail(p_season_id uuid)
 returns table(id uuid, game_date timestamp with time zone, venue text, home_team_id uuid, away_team_id uuid, home_team_name text, away_team_name text, home_score integer, away_score integer, status text, game_type text, playoff_round text, series_game integer)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select g.id, g.game_date, g.venue,
         g.home_team_id, g.away_team_id,
         coalesce(ht.name, ''), coalesce(at.name, ''),
         g.home_score, g.away_score,
         g.status, g.game_type, g.playoff_round, g.series_game
  from public.games g
  left join public.teams ht on ht.id = g.home_team_id
  left join public.teams at on at.id = g.away_team_id
  where g.season_id = p_season_id
    and (not g.is_test or public.can_see_test())
  order by g.game_date desc
$function$;

-- ---------------------------------------------------------------------------
-- The two test teams. Names say what they are, in case one ever surfaces somewhere.
insert into public.teams (name, city, status, is_test, age_group, primary_color, secondary_color)
select v.name, 'בדיקה', 'active', true, 'senior', v.c1, v.c2
from (values ('🧪 בדיקה א', '#7c3aed', '#ffffff'),
             ('🧪 בדיקה ב', '#0d9488', '#ffffff')) as v(name, c1, c2)
where not exists (select 1 from public.teams t where t.name = v.name);
