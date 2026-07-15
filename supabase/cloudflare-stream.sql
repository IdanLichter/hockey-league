-- ============================================================================
-- Cloudflare Stream — allow provider='cloudflare' on game_videos.
--
-- Browser one-tap live streaming (Cloudflare Stream Live, WHIP ingest). A live
-- input's uid (32 hex chars) is stored in game_videos.video_id exactly like a
-- YouTube id — the existing `char_length(video_id) between 6 and 32` check fits
-- it, and both the public-read and can_stream_game() write policies are already
-- provider-agnostic. So relaxing the provider CHECK is the ONLY schema change.
--
-- Live→VOD is one row: the input records automatically (edge fn sets
-- recording.mode='automatic'), so after the broadcast the same row plays the
-- replay — mirroring the YouTube behaviour. Additive + idempotent.
--
-- The gate + row insert happen server-side in supabase/functions/stream-golive.
-- ============================================================================

alter table public.game_videos drop constraint if exists game_videos_provider_check;
alter table public.game_videos add constraint game_videos_provider_check
  check (provider in ('youtube', 'cloudflare'));

-- Cloudflare's playback host is per-account (customer-<CODE>.cloudflarestream.com).
-- The stream-golive edge fn parses <CODE> from the live input's webRTCPlayback
-- URL and stores it here, so every spectator builds the player URL from the row
-- alone — no frontend env var / per-deploy config. Null for youtube rows.
alter table public.game_videos add column if not exists cf_customer_code text;
