-- Rollback for feed-photo-overrides.sql.
-- Dropping the table reverts every card to its automatic (FNV-hash) photo pick.
drop table if exists public.feed_photo_overrides;
