-- App (RTMP) streaming (2026-09-28)
--
-- Cloudflare does not record WebRTC (WHIP) input — 33 browser streams, 0 recordings.
-- The native apps now publish over RTMPS instead, which Cloudflare records and serves
-- as HLS. A row has to say which kind it is, because the players differ:
--   ingest = 'webrtc' -> live plays over WHEP+TURN (web page / old app builds)
--   ingest = 'rtmp'   -> live AND replay play in the Stream iframe (HLS)
-- cf_live_input keeps the live input's uid after stream-replay swaps video_id over to
-- the recording, so the swap is detectable (video_id = cf_live_input -> still live/idle).
--
-- Rollback: stream-rtmp-ingest-down.sql

alter table public.game_videos
  add column if not exists ingest text not null default 'webrtc',
  add column if not exists cf_live_input text;

do $$ begin
  alter table public.game_videos add constraint game_videos_ingest_check
    check (ingest in ('webrtc', 'rtmp'));
exception when duplicate_object then null; end $$;
