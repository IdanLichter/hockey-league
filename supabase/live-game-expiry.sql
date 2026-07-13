-- Auto-expiry for abandoned live games.
--
-- A judge who closes the scoreboard tab WITHOUT hitting finish/abandon leaves a
-- zombie: games.status stuck 'in_progress' + a live_game_state row that makes the
-- site show the game as live forever. (A proper finish clears the live row via
-- judge_save_game_result; a proper abandon via set_game_status. Only closing the
-- tab escapes both.)
--
-- This sweep reverts such games and clears their live rows. It is scheduled with
-- pg_cron every 5 minutes; it is also safe to call by hand.

create or replace function public.expire_stale_live_games(p_minutes int default 30)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := now() - make_interval(mins => greatest(p_minutes, 1));
  v_count  int;
begin
  -- "Stale" = the board stopped being driven:
  --   paused  → no broadcast (updated_at frozen) for > p_minutes  (a real timeout
  --             / period break is far shorter), OR
  --   running → the deadline itself passed > p_minutes ago and nobody advanced the
  --             period (a live running clock has clock_ends_at in the FUTURE, so it
  --             is never matched — running games stay safe).
  --
  -- Revert status FIRST (while the join to the live row still exists). A game that
  -- finished normally has no live row, so this only touches abandoned boards. Keep
  -- 'completed' when a result was already saved, else treat as never-officiated.
  update public.games g
     set status = case
                    when g.home_score is not null and g.away_score is not null then 'completed'
                    else 'scheduled'
                  end
    from public.live_game_state l
   where l.game_id = g.id
     and g.status = 'in_progress'
     and (
       (l.is_running = false and l.updated_at < v_cutoff)
       or (l.is_running = true and coalesce(l.clock_ends_at, l.updated_at) < v_cutoff)
     );

  -- Then drop the stale live rows (same predicate).
  delete from public.live_game_state l
   where (l.is_running = false and l.updated_at < v_cutoff)
      or (l.is_running = true and coalesce(l.clock_ends_at, l.updated_at) < v_cutoff);

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Maintenance only — never reachable by the public API.
revoke all    on function public.expire_stale_live_games(int) from public, anon, authenticated;
grant  execute on function public.expire_stale_live_games(int) to service_role;

-- Run every 5 minutes. cron.schedule upserts by job name, so re-applying is safe.
select cron.schedule('expire-stale-live-games', '*/5 * * * *', $$select public.expire_stale_live_games();$$);
