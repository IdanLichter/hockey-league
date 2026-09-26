-- Reverts feed-personalization.sql. Drops the collected impressions.
drop function if exists public.feed_personalization();
drop function if exists public.log_feed_impressions(jsonb);
drop table if exists public.feed_impressions;
