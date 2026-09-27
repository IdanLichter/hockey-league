-- game-form-results.sql (2026-09-27)
-- Applied to production via MCP as migration `game_form_results`. Down: game-form-results-down.sql.
--
-- Entering a result AFTER the game from the handwritten referee form (טופס שיפוט).
-- Some teams won't run the game clock at their rink, so those games never reach
-- judge_save_game_result and would stay "scheduled" forever: no standings, no market
-- settlement, no suspensions.
--
-- Flow: a referee / league manager / admin photographs the form → the photo lands in the
-- private `game-forms` bucket and a `game_form_submissions` row is created → a Claude cloud
-- routine reads it (scripts/game-form/ROUTINE.md, through the token-gated `game-form` edge
-- function) and writes `extracted` → the same person reviews it next to the photo, fixes
-- whatever the reading got wrong, and approves → apply_game_form_result().
--
-- Coaches are deliberately NOT allowed — a coach must not be able to enter his own score.
-- The permission set is exactly judge_save_game_result's (admin | judge) plus league managers.
--
-- The AI reading is only a prefill. Nothing is written to games/game_stats until a human
-- presses approve, and the same RPC works with no submission at all (manual entry).

-- ---- who may enter a result from a form -----------------------------------
create or replace function public.can_enter_game_result()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.is_league_manager() or public.is_judge();
$$;
revoke all on function public.can_enter_game_result() from public, anon;
grant execute on function public.can_enter_game_result() to authenticated;

-- ---- photos -----------------------------------------------------------------
-- Private. Path: <game_id>/<random>.jpg. The client re-encodes phone photos (HEIC too) to JPEG.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('game-forms', 'game-forms', false, 15728640, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "game-forms upload officials" on storage.objects;
create policy "game-forms upload officials" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'game-forms' and public.can_enter_game_result());

drop policy if exists "game-forms read officials" on storage.objects;
create policy "game-forms read officials" on storage.objects
  for select to authenticated
  using (bucket_id = 'game-forms' and public.can_enter_game_result());

-- ---- submissions ------------------------------------------------------------
create table if not exists public.game_form_submissions (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references public.games(id) on delete cascade,
  submitted_by  uuid references auth.users(id) default auth.uid(),
  photo_paths   text[] not null,
  -- uploaded → analyzing → analyzed | failed ; then applied (approved by a human) | discarded
  status        text not null default 'uploaded'
                check (status in ('uploaded','analyzing','analyzed','failed','applied','discarded')),
  extracted     jsonb,          -- what the routine read (prefill only)
  extract_error text,
  final         jsonb,          -- what the human approved
  analyzed_at   timestamptz,
  applied_by    uuid references auth.users(id),
  applied_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists game_form_submissions_game_idx on public.game_form_submissions(game_id, created_at desc);
create index if not exists game_form_submissions_open_idx on public.game_form_submissions(status) where status in ('uploaded','analyzing');
create index if not exists game_form_submissions_submitter_idx on public.game_form_submissions(submitted_by);
create index if not exists game_form_submissions_applier_idx on public.game_form_submissions(applied_by);

alter table public.game_form_submissions enable row level security;
-- Read-only to officials. Every write goes through the RPCs below or the edge function
-- (service role).
drop policy if exists "officials read game forms" on public.game_form_submissions;
create policy "officials read game forms" on public.game_form_submissions
  for select to authenticated using ((select public.can_enter_game_result()));

create or replace function public.create_game_form_submission(p_game uuid, p_paths text[])
returns uuid language plpgsql security definer set search_path = public as $$
declare g public.games; v_id uuid;
begin
  if not public.can_enter_game_result() then raise exception 'not authorized'; end if;
  select * into g from public.games where id = p_game;
  if not found then raise exception 'game not found'; end if;
  if g.status = 'completed' then raise exception 'game already completed'; end if;
  if p_paths is null or cardinality(p_paths) < 1 or cardinality(p_paths) > 4 then
    raise exception 'between 1 and 4 photos';
  end if;
  if exists (select 1 from unnest(p_paths) p where p not like p_game::text || '/%') then
    raise exception 'photo path must be under the game folder';
  end if;
  -- One live reading per game: an older unfinished one is superseded.
  update public.game_form_submissions set status = 'discarded'
   where game_id = p_game and status in ('uploaded','analyzing','analyzed','failed');
  insert into public.game_form_submissions (game_id, photo_paths)
  values (p_game, p_paths) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_game_form_submission(uuid, text[]) from public, anon;
grant execute on function public.create_game_form_submission(uuid, text[]) to authenticated;

-- ---- apply ------------------------------------------------------------------
-- Same end state as judge_save_game_result, plus what the paper form carries that the
-- live path never wrote: own goals, clean-sheet flags, and red-card suspensions.
--   p_stats: [{player_id, goals, blue_cards, red_cards, played_gk?}]
--   A row belongs to the side the player is rostered on (players.team_id OR player_teams).
--   Goals credited to players + own goals may not exceed the side's score (fewer is allowed:
--   a form can leave a scorer unreadable).
create or replace function public.apply_game_form_result(
  p_game uuid, p_home_score int, p_away_score int,
  p_home_own_goals int default 0, p_away_own_goals int default 0,
  p_stats jsonb default '[]'::jsonb, p_submission uuid default null,
  p_suspend_red boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare
  g public.games;
  bad int;
  home_goals int;
  away_goals int;
begin
  if not public.can_enter_game_result() then raise exception 'not authorized to enter results'; end if;
  if p_home_score is null or p_away_score is null or p_home_score not between 0 and 50 or p_away_score not between 0 and 50 then
    raise exception 'invalid score (must be 0..50)';
  end if;
  if coalesce(p_home_own_goals,0) < 0 or coalesce(p_away_own_goals,0) < 0 then raise exception 'invalid own goals'; end if;

  select * into g from public.games where id = p_game for update;
  if not found then raise exception 'game not found'; end if;
  if g.status = 'completed' then raise exception 'game already completed'; end if;
  if g.status = 'cancelled' then raise exception 'game is cancelled'; end if;
  if g.game_date > now() + interval '3 hours' then raise exception 'game has not been played yet'; end if;

  -- side per row: 'H' / 'A' / null (not on either team)
  drop table if exists _rows;
  create temp table _rows on commit drop as
  select (r->>'player_id')::uuid as player_id,
         coalesce((r->>'goals')::int, 0) as goals,
         coalesce((r->>'blue_cards')::int, 0) as blue_cards,
         coalesce((r->>'red_cards')::int, 0) as red_cards,
         coalesce((r->>'played_gk')::boolean, false) as played_gk,
         case
           when exists (select 1 from public.players pl where pl.id = (r->>'player_id')::uuid and pl.team_id = g.home_team_id)
             or exists (select 1 from public.player_teams pt where pt.player_id = (r->>'player_id')::uuid and pt.team_id = g.home_team_id) then 'H'
           when exists (select 1 from public.players pl where pl.id = (r->>'player_id')::uuid and pl.team_id = g.away_team_id)
             or exists (select 1 from public.player_teams pt where pt.player_id = (r->>'player_id')::uuid and pt.team_id = g.away_team_id) then 'A'
         end as side
  from jsonb_array_elements(coalesce(p_stats, '[]'::jsonb)) r
  where (r->>'player_id') is not null;

  select count(*) into bad from _rows
   where side is null or goals < 0 or blue_cards < 0 or red_cards < 0 or blue_cards > 3 or red_cards > 1;
  if bad > 0 then raise exception 'box score has % invalid row(s) (player not on either team, or impossible count)', bad; end if;
  if (select count(*) from _rows) <> (select count(distinct player_id) from _rows) then
    raise exception 'a player appears twice in the box score';
  end if;

  select coalesce(sum(goals) filter (where side = 'H'), 0), coalesce(sum(goals) filter (where side = 'A'), 0)
    into home_goals, away_goals from _rows;
  if home_goals + coalesce(p_home_own_goals,0) > p_home_score then
    raise exception 'home scorers (%) + own goals (%) exceed the home score (%)', home_goals, p_home_own_goals, p_home_score;
  end if;
  if away_goals + coalesce(p_away_own_goals,0) > p_away_score then
    raise exception 'away scorers (%) + own goals (%) exceed the away score (%)', away_goals, p_away_own_goals, p_away_score;
  end if;

  delete from public.game_stats where game_id = p_game;
  insert into public.game_stats (game_id, player_id, goals, blue_cards, red_cards, clean_sheet)
  select p_game, r.player_id, r.goals, r.blue_cards, r.red_cards,
         r.played_gk and case r.side when 'H' then p_away_score = 0 else p_home_score = 0 end
  from _rows r;

  update public.games
     set home_score = p_home_score, away_score = p_away_score,
         home_own_goals = coalesce(p_home_own_goals, 0), away_own_goals = coalesce(p_away_own_goals, 0),
         home_clean_sheet = (p_away_score = 0), away_clean_sheet = (p_home_score = 0),
         status = 'completed'
   where id = p_game;   -- AFTER UPDATE triggers: market settlement, suspensions served, result notifications

  perform public.recompute_team_standings(g.home_team_id);
  perform public.recompute_team_standings(g.away_team_id);
  delete from public.live_game_state where game_id = p_game;

  -- A red card on the form blocks the next game, same as the judge issuing it live.
  -- Inserted AFTER the completion update so this game is not counted as served.
  if p_suspend_red then
    insert into public.player_suspensions (player_id, issued_game_id, reason, games_remaining, created_by)
    select r.player_id, p_game, 'כרטיס אדום (טופס שיפוט)', 1, (select auth.uid())
    from _rows r
    where r.red_cards > 0
      and not exists (select 1 from public.player_suspensions s where s.player_id = r.player_id and s.issued_game_id = p_game);
  end if;

  if p_submission is not null then
    update public.game_form_submissions
       set status = 'applied', applied_by = (select auth.uid()), applied_at = now(),
           final = jsonb_build_object('home_score', p_home_score, 'away_score', p_away_score,
                                      'home_own_goals', p_home_own_goals, 'away_own_goals', p_away_own_goals,
                                      'stats', p_stats)
     where id = p_submission and game_id = p_game;
  end if;
  update public.game_form_submissions set status = 'discarded'
   where game_id = p_game and status in ('uploaded','analyzing','analyzed','failed');
end;
$$;
revoke all on function public.apply_game_form_result(uuid,int,int,int,int,jsonb,uuid,boolean) from public, anon;
grant execute on function public.apply_game_form_result(uuid,int,int,int,int,jsonb,uuid,boolean) to authenticated;
