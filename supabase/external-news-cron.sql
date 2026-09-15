-- ============================================================================
-- Daily poll of the external rink-hockey feeds.
--
-- APPLIED 2026-09-15 as migration `external_news_cron`; the vault secret below was
-- created in the same session, and a one-off backfill (max_age_days 120) seeded the
-- first 4 items. External news is LIVE on the public feed and, because the native
-- apps read `posts`, on iOS and Android too.
--
-- To see what a run would do without writing anything:
--
--   curl -sX POST https://slpwwoupbbxcgjivcspv.supabase.co/functions/v1/ingest-rink-hockey-news \
--     -H "Authorization: Bearer <service-role key>" -H 'Content-Type: application/json' \
--     -d '{"dry_run":true,"max_age_days":60}'
--
-- Daily, not hourly: every source's RSS window is only 10-15 items, so a poll
-- slower than ~daily silently loses items during a tournament burst — but the
-- feeds are quiet for weeks at a time, so hourly would buy nothing.
-- ============================================================================

-- 1) The edge function authenticates the caller by comparing the bearer token to
--    its own service-role key (verify_jwt alone is NOT enough — the anon key is a
--    valid JWT and is public). Store that key in the vault, as push_webhook_secret
--    already is. Run once, with the project's service-role key:
--
--   select vault.create_secret('<service-role key>', 'ingest_service_key',
--                              'Bearer token pg_cron sends to ingest-rink-hockey-news');
--
-- NOTE: that key is the NEW `sb_secret_…` one the runtime injects as
-- SUPABASE_SERVICE_ROLE_KEY — NOT the legacy service_role JWT, which the function
-- rejects with 403.

-- 2) The job.
create or replace function public.run_rink_hockey_news_ingest()
returns void language plpgsql security definer set search_path = public as $$
declare v_key text;
begin
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'ingest_service_key' limit 1;
  if v_key is null then
    raise warning 'ingest_service_key missing from vault — skipping news ingest';
    return;
  end if;

  perform net.http_post(
    url     := 'https://slpwwoupbbxcgjivcspv.supabase.co/functions/v1/ingest-rink-hockey-news',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer ' || v_key),
    body    := '{}'::jsonb   -- no dry_run, no max_age_days → the normal 14-day window
  );
end; $$;

revoke execute on function public.run_rink_hockey_news_ingest() from public, anon, authenticated;

-- 05:00 UTC ≈ 08:00 Israel. cron.schedule upserts by name, so re-applying is safe.
select cron.schedule('rink-hockey-news', '0 5 * * *',
                     $$select public.run_rink_hockey_news_ingest();$$);

-- ---------- rollback ----------
-- select cron.unschedule('rink-hockey-news');
-- drop function if exists public.run_rink_hockey_news_ingest();
