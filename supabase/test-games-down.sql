-- Rollback for test-games.sql. Deletes the test games + teams first (their live state,
-- stats, videos cascade with the games), then restores the pre-sandbox functions by
-- re-running their previous definitions from git (market-*.sql, game-reminders.sql,
-- player-suspensions.sql, officials.sql, season functions) — this file only removes
-- what test-games.sql added. Redeploy weekly-preview without .eq("is_test") BEFORE
-- dropping the columns, or its queries 400.
delete from public.games where is_test;
delete from public.teams where is_test;

drop trigger if exists trg_notifications_skip_test_games on public.notifications;
drop function if exists public.notifications_skip_test_games();
drop trigger if exists trg_games_derive_is_test on public.games;
drop function if exists public.games_derive_is_test();

drop policy if exists "hide test teams" on public.teams;
drop policy if exists "hide test games" on public.games;
drop policy if exists "hide test games" on public.live_game_state;
drop policy if exists "hide test games" on public.game_stats;
drop policy if exists "hide test games" on public.game_videos;
drop policy if exists "hide test games" on public.markets;
drop policy if exists "hide test games" on public.game_availability;
drop policy if exists "hide test games" on public.game_officials;
drop policy if exists "hide test games" on public.game_video_markers;

-- The guarded functions reference games.is_test; restore their old bodies (see above)
-- before this line, or they'll error at runtime.
alter table public.games drop column if exists is_test;
alter table public.teams drop column if exists is_test;
drop function if exists public.is_test_game(uuid);
drop function if exists public.can_see_test();
