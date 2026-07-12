-- Rollback for video-highlights.sql. Drops both tables (markers first — FK) and
-- the helper. Purely removes what the up-migration added; no existing data.
drop table if exists public.game_video_markers;
drop table if exists public.game_videos;
drop function if exists public.can_stream_game(uuid);
