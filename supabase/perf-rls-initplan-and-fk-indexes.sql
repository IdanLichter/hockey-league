-- Performance hygiene, 2026-07-15.
-- Clears two Supabase advisor categories with zero behavior change:
--   1. auth_rls_initplan  — 3 admin-write policies re-evaluated auth.jwt() per row.
--   2. unindexed_foreign_keys — 10 FKs missing a covering index.
-- No logic changes: the RLS boolean expressions are identical, only the auth
-- call is wrapped in a scalar subselect so Postgres evaluates it once per query
-- (InitPlan) instead of once per row. admin_users' OWN policies are untouched,
-- so the known admin_users self-read recursion trap is not in play.

-- 1) RLS: wrap auth.jwt() so it runs once per statement, not per row. -----------
alter policy "Admin write game_stats" on public.game_stats
  using      (((select auth.jwt()) ->> 'email') in (select email from admin_users))
  with check (((select auth.jwt()) ->> 'email') in (select email from admin_users));

alter policy "Admin write games" on public.games
  using      (((select auth.jwt()) ->> 'email') in (select email from admin_users))
  with check (((select auth.jwt()) ->> 'email') in (select email from admin_users));

alter policy "Admin write players" on public.players
  using      (((select auth.jwt()) ->> 'email') in (select email from admin_users))
  with check (((select auth.jwt()) ->> 'email') in (select email from admin_users));

-- 2) Covering indexes for unindexed foreign keys (additive, IF NOT EXISTS). -----
create index if not exists album_submissions_reviewed_by_idx  on public.album_submissions (reviewed_by);
create index if not exists album_submissions_submitted_by_idx on public.album_submissions (submitted_by);
create index if not exists game_availability_player_id_idx    on public.game_availability (player_id);
create index if not exists game_video_markers_created_by_idx  on public.game_video_markers (created_by);
create index if not exists game_video_markers_player_id_idx   on public.game_video_markers (player_id);
create index if not exists game_video_markers_team_id_idx     on public.game_video_markers (team_id);
create index if not exists game_videos_created_by_idx         on public.game_videos (created_by);
create index if not exists live_game_state_updated_by_idx     on public.live_game_state (updated_by);
create index if not exists player_submissions_player_id_idx   on public.player_submissions (player_id);
create index if not exists team_join_requests_profile_id_idx  on public.team_join_requests (profile_id);
