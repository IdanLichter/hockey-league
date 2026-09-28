-- Rollback for stream-rtmp-ingest.sql. Revert stream-golive and the web/app players
-- first — they select/insert these columns.
alter table public.game_videos drop constraint if exists game_videos_ingest_check;
alter table public.game_videos drop column if exists cf_live_input, drop column if exists ingest;
