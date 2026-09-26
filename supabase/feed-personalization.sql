-- Feed personalization: what each signed-in viewer actually looked at, and what the
-- ranker derives from it.
--
-- Why impressions and not just likes: across the whole league there are ~12 likes and
-- ~6 comments in total. Explicit reactions are far too sparse to learn anyone's taste
-- from, so the signal has to be implicit — which cards stayed on screen, for how long,
-- and which ones were tapped through.
--
-- One row per (viewer, feed item), aggregated in place. The feed item is identified by
-- the SAME key every client already uses for reactions: `game-<id>`, `ms-<game>-<scorer>`,
-- `champion`, `top-scorer`, `post-<uuid>`. Synthetic items have no table of their own,
-- so the client sends the item's tags (team/player/source/type) with the impression;
-- that is what lets the server compute affinity without knowing how the feed is built.
--
-- Private: a viewer can read their own rows and nobody else's, not even admins. This is
-- behavioural data about accounts that include minors; it exists to rank the feed and
-- for nothing else. Deleting the account deletes it (on delete cascade).

create table if not exists public.feed_impressions (
  user_id       uuid not null references auth.users(id) on delete cascade,
  item_key      text not null check (length(item_key) between 1 and 200),
  tags          text[] not null default '{}',
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  view_count    int not null default 0,     -- distinct times it came on screen
  dwell_ms      bigint not null default 0,  -- total time on screen
  open_count    int not null default 0,     -- taps through (links, game page, video)
  primary key (user_id, item_key)
);

create index if not exists feed_impressions_item_idx on public.feed_impressions (item_key);

alter table public.feed_impressions enable row level security;

drop policy if exists "Read own feed impressions" on public.feed_impressions;
create policy "Read own feed impressions" on public.feed_impressions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- No write grant at all: rows only arrive through log_feed_impressions() below, which
-- takes the user from the JWT and clamps every number.
revoke all on public.feed_impressions from anon, authenticated;
grant select on public.feed_impressions to authenticated;

/**
 * Record a batch of impressions for the calling user.
 *
 * p_events: [{ key, tags?, views?, dwell_ms?, opens? }, ...] — deltas since the last
 * flush, not totals. Guests are ignored (nothing to personalise). Values are clamped so
 * a buggy or hostile client can at worst skew its own feed.
 *
 * Returns the number of rows touched.
 */
create or replace function public.log_feed_impressions(p_events jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n   int;
begin
  if v_uid is null or p_events is null or jsonb_typeof(p_events) <> 'array' then
    return 0;
  end if;

  with incoming as (
    select
      left(e ->> 'key', 200) as item_key,
      coalesce((
        select array_agg(left(t, 80))
        from (select t from jsonb_array_elements_text(
                case when jsonb_typeof(e -> 'tags') = 'array' then e -> 'tags' else '[]'::jsonb end
              ) t limit 12) s
      ), '{}') as tags,
      least(greatest(coalesce(nullif(e ->> 'views', '')::int, 0), 0), 20)          as views,
      least(greatest(coalesce(nullif(e ->> 'dwell_ms', '')::bigint, 0), 0), 600000) as dwell,
      least(greatest(coalesce(nullif(e ->> 'opens', '')::int, 0), 0), 20)          as opens
    from (select e from jsonb_array_elements(p_events) e limit 200) b
    where coalesce(e ->> 'key', '') <> ''
  ),
  -- One client batch can carry the same key twice (two flushes merged after a
  -- reconnect); ON CONFLICT cannot touch a row twice in one statement, so fold first.
  folded as (
    -- max() of text[] prefers any non-empty array over '{}', which is all we need.
    select item_key, max(tags) as tags,
           sum(views)::int as views, sum(dwell) as dwell, sum(opens)::int as opens
    from incoming group by item_key
  ),
  up as (
    insert into public.feed_impressions as fi
      (user_id, item_key, tags, view_count, dwell_ms, open_count)
    select v_uid, item_key, tags, views, dwell, opens from folded
    on conflict (user_id, item_key) do update set
      tags         = case when cardinality(excluded.tags) > 0 then excluded.tags else fi.tags end,
      view_count   = least(fi.view_count + excluded.view_count, 100000),
      dwell_ms     = least(fi.dwell_ms + excluded.dwell_ms, 86400000),
      open_count   = least(fi.open_count + excluded.open_count, 100000),
      last_seen_at = now()
    returning 1
  )
  select count(*) into v_n from up;
  return v_n;
end;
$$;

revoke all on function public.log_feed_impressions(jsonb) from public, anon;
grant execute on function public.log_feed_impressions(jsonb) to authenticated;

/**
 * Everything the client ranker needs, in one round trip. Signed-in only.
 *
 * {
 *   seen:     { "<item_key>": "<last_seen_at>" }   items this viewer really looked at
 *                                                   (>= 1.5s on screen, or opened)
 *   affinity: { "<tag>": -1..1 }                    how much more (or less) this viewer
 *                                                   engages with a tag than with the
 *                                                   feed on average
 *   popular:  { "<item_key>": n }                   league-wide engagement, last 60 days
 * }
 *
 * Affinity per impression is an engagement score e: up to 1.5 for dwell (10s = 1),
 * +2 per open (max 3), +3 if liked, +4 if commented, and -0.3 for a card that was on
 * screen and got scrolled straight past. A tag's affinity is the viewer's engagement
 * with it relative to their own mean, shrunk towards 0 by 5 phantom average samples so
 * three stray views can't define anyone — then squashed to -1..1.
 */
create or replace function public.feed_personalization()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_seen jsonb;
  v_aff  jsonb;
  v_pop  jsonb;
begin
  if v_uid is null then
    return null;
  end if;

  select coalesce(jsonb_object_agg(item_key, last_seen_at), '{}'::jsonb) into v_seen
  from public.feed_impressions
  where user_id = v_uid
    and last_seen_at > now() - interval '90 days'
    and (dwell_ms >= 1500 or open_count > 0);

  with mine as (
    select fi.item_key, fi.tags, fi.dwell_ms, fi.open_count, fi.view_count,
           exists (select 1 from public.feed_item_likes l
                   where l.user_id = v_uid and l.item_key = fi.item_key)
        or exists (select 1 from public.post_likes pl
                   where pl.user_id = v_uid and fi.item_key = 'post-' || pl.post_id::text) as liked,
           exists (select 1 from public.feed_item_comments c
                   where c.author_id = v_uid and c.item_key = fi.item_key and c.deleted_at is null)
        or exists (select 1 from public.comments c
                   where c.author_id = v_uid and fi.item_key = 'post-' || c.post_id::text
                     and c.deleted_at is null) as commented
    from public.feed_impressions fi
    where fi.user_id = v_uid and fi.view_count > 0
  ),
  scored as (
    select tags,
      least(dwell_ms / 10000.0, 1.5)
      + 2 * least(open_count, 3)
      + case when liked then 3 else 0 end
      + case when commented then 4 else 0 end
      - case when dwell_ms < 800 and open_count = 0 and not liked and not commented then 0.3 else 0 end
        as e
    from mine
  ),
  mean as (select coalesce(avg(e), 0) as m from scored),
  per_tag as (
    select t as tag, count(*) as n, sum(e) as s
    from scored, unnest(tags) t
    group by t
  )
  select coalesce(jsonb_object_agg(tag, round(tanh(((s - m * n) / (n + 5))::float8)::numeric, 3)), '{}'::jsonb)
    into v_aff
  from per_tag, mean;

  -- League-wide, so a card other people lingered on or reacted to rises a little for
  -- everyone. Counts only — nobody's individual behaviour leaves this function.
  with eng as (
    select item_key, 1.0 as w from public.feed_item_likes where created_at > now() - interval '60 days'
    union all
    select 'post-' || post_id::text, 1.0 from public.post_likes where created_at > now() - interval '60 days'
    union all
    select item_key, 2.0 from public.feed_item_comments where deleted_at is null and created_at > now() - interval '60 days'
    union all
    select 'post-' || post_id::text, 2.0 from public.comments where deleted_at is null and created_at > now() - interval '60 days'
    union all
    select item_key, 0.5 from public.feed_impressions
    where user_id <> v_uid and last_seen_at > now() - interval '60 days' and (dwell_ms >= 3000 or open_count > 0)
  )
  select coalesce(jsonb_object_agg(item_key, total), '{}'::jsonb) into v_pop
  from (select item_key, sum(w) as total from eng group by item_key) x;

  return jsonb_build_object('seen', v_seen, 'affinity', v_aff, 'popular', v_pop);
end;
$$;

revoke all on function public.feed_personalization() from public, anon;
grant execute on function public.feed_personalization() to authenticated;
