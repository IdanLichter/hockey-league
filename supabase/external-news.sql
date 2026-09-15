-- ============================================================================
-- External rink-hockey news in the feed  (migration `external_news`)
--
-- Three vetted sources (see docs/rink-hockey-sources.md) are polled daily by
-- the `ingest-rink-hockey-news` edge function and land as rows in public.posts,
-- authored by a single bot profile. Reusing `posts` rather than a new table is
-- deliberate: iOS and Android already read `posts`, so external news reaches all
-- three clients without an app release.
--
-- What's added here:
--   • posts.source_name / link_url / image_url / external_guid — the fields a
--     news card needs that a human post never had.
--   • external_guid is UNIQUE → it IS the dedupe key. A soft-deleted item keeps
--     its row, so an item a moderator removes is never re-posted by the next run.
--   • profiles.is_bot → exempts the bot from the 1-post/24h rate limit WITHOUT
--     granting it a user_roles row (a role would also paint a "עורך תוכן" badge
--     on every card and hand a non-human account moderation powers).
-- ============================================================================

-- 1) News fields on posts. All nullable → every existing row stays a human post.
alter table public.posts add column if not exists source_name   text;
alter table public.posts add column if not exists link_url      text;
alter table public.posts add column if not exists image_url     text;
alter table public.posts add column if not exists external_guid text;

-- The dedupe key. NOT partial, deliberately: a partial unique index cannot be an
-- ON CONFLICT target unless the statement repeats the index predicate, and
-- PostgREST emits a bare "ON CONFLICT (external_guid)" -> error 42P10. Postgres
-- treats NULLs as distinct in a unique index, so human posts (NULL) still never
-- conflict with each other. (Applied as migration `external_news_fix_conflict_target`.)
create unique index if not exists posts_external_guid_key
  on public.posts(external_guid);

-- Feed reads order by created_at; external rows backdate created_at to the
-- source's publish time, so they interleave correctly with league content.
comment on column public.posts.external_guid is
  'Stable id from the source feed (YouTube video id / RSS guid). Unique → re-ingest is a no-op, including for soft-deleted rows.';

-- 2) Bot accounts. The ingest function provisions its own auth user on first run
--    and flips this flag; nothing else in the app sets it.
alter table public.profiles add column if not exists is_bot boolean not null default false;

-- 3) Rate limit: exempt bots. Previously admins + roled users were exempt; a bot
--    is neither, so without this the second item of every run raises
--    'post_rate_limit'. (Triggers fire for the service role too — bypassing RLS
--    does not bypass a BEFORE trigger.)
create or replace function public.enforce_post_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare recent int;
begin
  if public.is_admin()
     or exists (select 1 from public.user_roles where user_id = new.author_id)
     or exists (select 1 from public.profiles where id = new.author_id and is_bot)
  then
    return new; -- admins + roled users + ingest bots are exempt
  end if;
  select count(*) into recent from public.posts
    where author_id = new.author_id and deleted_at is null
      and created_at > now() - interval '24 hours';
  if recent >= 1 then
    raise exception 'post_rate_limit' using hint = 'regular users may post once per day';
  end if;
  return new;
end; $$;

revoke execute on function public.enforce_post_rate_limit() from public, anon, authenticated;

-- ---------- rollback ----------
-- drop index if exists public.posts_external_guid_key;
-- alter table public.posts drop column if exists source_name, drop column if exists link_url,
--   drop column if exists image_url, drop column if exists external_guid;
-- alter table public.profiles drop column if exists is_bot;
-- (and restore enforce_post_rate_limit() from feed-posts-b2.sql)
