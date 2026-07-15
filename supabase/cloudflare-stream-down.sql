-- Revert Cloudflare Stream provider support. SAFE ONLY if no cloudflare rows
-- exist (the CHECK would reject them) — delete or migrate them first:
--   delete from public.game_videos where provider = 'cloudflare';
alter table public.game_videos drop column if exists cf_customer_code;
alter table public.game_videos drop constraint if exists game_videos_provider_check;
alter table public.game_videos add constraint game_videos_provider_check
  check (provider in ('youtube'));
