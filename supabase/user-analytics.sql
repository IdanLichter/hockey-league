-- User analytics (2026-09-28) — the /admin "ניתוח משתמשים" tab.
--
-- Ariel wants to see what users do so the app can be improved — per named user, not only
-- anonymous totals (his decision, 2026-09-28; it reverses the "aggregate only" stance of
-- telemetry.sql for ADMINS). Everything here is ADMIN-ONLY (is_admin(), not league
-- managers): it exposes individual behaviour, including minors'.
--
-- One activity stream is assembled from what already exists — no new collection here:
--   app_events         screens (kind=page), writes (action), errors — web + iOS + Android
--   post_likes / feed_item_likes, comments / feed_item_comments, posts, market_trades,
--   follows, direct_messages (sent), game_availability (the linked player's own answers),
--   medical_certificates (uploaded_by), player_claims, feed_impressions (last look)
--   auth.sessions      last seen + platform per device, from the user agent — the only
--                      signal for app users on builds that don't log screens yet.
-- Platform from user agent: RinkHockeyIL/* = iOS, okhttp/* = Android, else web.
--
-- Free-tier cost: nothing is stored; every function reads existing tables. app_events is
-- still pruned at 90 days (telemetry.sql), so screen history is at most 90 days deep.
--
-- Rollback: user-analytics-down.sql

-- ---------------------------------------------------------------------------
-- Path → feature (Hebrew label). Web routes and the apps share this vocabulary.
create or replace function public.analytics_feature(p_path text)
returns text
language sql
immutable
as $$
  select case
    when p_path is null then null
    when p_path in ('/', '/feed') then 'פיד'
    when p_path = '/games/next' then 'הרשמה למשחק'
    when p_path like '/games%' then 'משחקים'
    when p_path like '/standings%' then 'טבלה'
    when p_path like '/teams%' then 'קבוצות'
    when p_path like '/players%' then 'שחקנים'
    when p_path like '/market%' then 'הוקי מרקט'
    when p_path like '/me%' then 'הדף שלי'
    when p_path like '/notifications%' then 'התראות'
    when p_path like '/admin%' then 'ניהול'
    when p_path like '/judge%' then 'שיפוט'
    when p_path like '/statistics%' or p_path like '/stats%' then 'סטטיסטיקה'
    when p_path like '/career%' then 'משחק קריירה'
    when p_path like '/tournaments%' then 'טורנירים'
    when p_path like '/archive%' then 'ארכיון'
    when p_path like '/media%' then 'מדיה'
    when p_path like '/chat%' then 'צ''אט'
    when p_path like '/creators%' then 'יוצרי תוכן'
    when p_path in ('/auth', '/onboarding', '/og') then 'כניסה ושיוך'
    else 'אחר'
  end;
$$;

create or replace function public.analytics_platform(p_ua text)
returns text
language sql
immutable
as $$
  select case
    when p_ua ilike 'RinkHockeyIL/%' then 'ios'
    when p_ua ilike 'okhttp/%' then 'android'
    when p_ua is null then null
    else 'web'
  end;
$$;

-- ---------------------------------------------------------------------------
-- The unified stream. INTERNAL: callable only by the definer functions below.
-- kind: 'screen' | 'like' | 'comment' | 'post' | 'bet' | 'follow' | 'message' |
--       'availability' | 'medical' | 'claim' | 'feed_view' | 'action' | 'error'
create or replace function public.analytics_activity(p_since timestamptz)
returns table (user_id uuid, ts timestamptz, platform text, kind text, feature text, path text, detail text)
language sql
stable
security definer
set search_path = public
as $$
  select e.user_id, e.created_at, e.platform,
         case e.kind when 'page' then 'screen' else e.kind end,
         case e.kind when 'page' then public.analytics_feature(e.path) else null end,
         e.path, e.name
    from public.app_events e
   where e.created_at >= p_since and e.user_id is not null
     -- noise: cancelled requests and broken-asset loads are not user behaviour
     and not (e.kind = 'error' and e.name in ('request_cancelled', 'asset_error'))
     -- the token refresh and the impression beacon are background traffic
     and not (e.kind = 'action' and e.name in ('auth:token', 'log_feed_impressions', 'market_wallet'))
  union all select l.user_id, l.created_at, null, 'like', 'פיד', null, 'post' from public.post_likes l where l.created_at >= p_since
  union all select l.user_id, l.created_at, null, 'like', 'פיד', null, 'item' from public.feed_item_likes l where l.created_at >= p_since
  union all select c.author_id, c.created_at, null, 'comment', 'פיד', null, 'post' from public.comments c where c.created_at >= p_since
  union all select c.author_id, c.created_at, null, 'comment', 'פיד', null, 'item' from public.feed_item_comments c where c.created_at >= p_since
  union all select p.author_id, p.created_at, null, 'post', 'פיד', null, null
              from public.posts p join public.profiles pr on pr.id = p.author_id
             where p.created_at >= p_since and not coalesce(pr.is_bot, false)
  union all select t.user_id, t.created_at, null, 'bet', 'הוקי מרקט', null, t.side from public.market_trades t where t.created_at >= p_since
  union all select f.user_id, f.created_at, null, 'follow', null, null, f.target_type from public.follows f where f.created_at >= p_since
  union all select m.sender_id, m.created_at, null, 'message', 'צ''אט', null, null from public.direct_messages m where m.created_at >= p_since
  union all select pr.id, coalesce(a.updated_at, a.created_at), null, 'availability', 'הרשמה למשחק', null, a.status
              from public.game_availability a join public.profiles pr on pr.player_id = a.player_id
             where coalesce(a.updated_at, a.created_at) >= p_since
  union all select m.uploaded_by, m.created_at, null, 'medical', 'הדף שלי', null, m.status
              from public.medical_certificates m where m.created_at >= p_since and m.uploaded_by is not null
  union all select c.profile_id, c.created_at, null, 'claim', 'כניסה ושיוך', null, c.status from public.player_claims c where c.created_at >= p_since
  union all select i.user_id, i.last_seen_at, null, 'feed_view', 'פיד', null, null from public.feed_impressions i where i.last_seen_at >= p_since;
$$;
revoke all on function public.analytics_activity(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Header numbers + a daily series. { totals: {...}, daily: [{day, users, web, ios, android, guests, events}] }
create or replace function public.analytics_overview(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  d int := greatest(1, least(coalesce(p_days, 30), 90));
  since timestamptz := date_trunc('day', now() at time zone 'Asia/Jerusalem') at time zone 'Asia/Jerusalem' - make_interval(days => d - 1);
  result jsonb;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  with act as (select * from public.analytics_activity(since)),
  sess as (
    select s.user_id, s.updated_at, public.analytics_platform(s.user_agent) platform
      from auth.sessions s where s.updated_at >= since
  ),
  days as (
    select generate_series((since at time zone 'Asia/Jerusalem')::date, (now() at time zone 'Asia/Jerusalem')::date, '1 day')::date as day
  ),
  daily as (
    select dd.day,
      (select count(distinct u) from (
          select a.user_id u from act a where (a.ts at time zone 'Asia/Jerusalem')::date = dd.day
          union select s.user_id from sess s where (s.updated_at at time zone 'Asia/Jerusalem')::date = dd.day) x) users,
      (select count(distinct u) from (
          select a.user_id u from act a where a.platform = 'web' and (a.ts at time zone 'Asia/Jerusalem')::date = dd.day
          union select s.user_id from sess s where s.platform = 'web' and (s.updated_at at time zone 'Asia/Jerusalem')::date = dd.day) x) web,
      (select count(distinct u) from (
          select a.user_id u from act a where a.platform = 'ios' and (a.ts at time zone 'Asia/Jerusalem')::date = dd.day
          union select s.user_id from sess s where s.platform = 'ios' and (s.updated_at at time zone 'Asia/Jerusalem')::date = dd.day) x) ios,
      (select count(distinct u) from (
          select a.user_id u from act a where a.platform = 'android' and (a.ts at time zone 'Asia/Jerusalem')::date = dd.day
          union select s.user_id from sess s where s.platform = 'android' and (s.updated_at at time zone 'Asia/Jerusalem')::date = dd.day) x) android,
      (select count(distinct e.session_id) from public.app_events e
        where e.user_id is null and e.kind = 'page' and (e.created_at at time zone 'Asia/Jerusalem')::date = dd.day) guests,
      (select count(*) from act a where a.kind = 'screen' and (a.ts at time zone 'Asia/Jerusalem')::date = dd.day) screens
    from days dd
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'accounts', (select count(*) from auth.users),
      'new_accounts', (select count(*) from auth.users where created_at >= since),
      'active', (select count(distinct u) from (select a.user_id u from act a union select s.user_id from sess s) x),
      'active_7d', (select count(distinct u) from (
          select a.user_id u from act a where a.ts > now() - interval '7 days'
          union select s.user_id from sess s where s.updated_at > now() - interval '7 days') x),
      'linked_players', (select count(*) from public.profiles where player_id is not null and not coalesce(is_bot, false)),
      'app_users', (select count(distinct s.user_id) from auth.sessions s where public.analytics_platform(s.user_agent) in ('ios', 'android')),
      'guests', (select count(distinct e.session_id) from public.app_events e where e.user_id is null and e.kind = 'page' and e.created_at >= since),
      'screens', (select count(*) from act where kind = 'screen'),
      'interactions', (select count(*) from act where kind in ('like','comment','post','bet','follow','message','availability','medical','claim'))
    ),
    'daily', (select coalesce(jsonb_agg(to_jsonb(daily) order by day), '[]'::jsonb) from daily)
  ) into result;
  return result;
end $$;

-- ---------------------------------------------------------------------------
-- One row per account (bots excluded), everything the admin needs to scan the userbase.
create or replace function public.analytics_users(p_days int default 30)
returns table (
  user_id uuid, display_name text, email text, avatar_url text,
  player_id uuid, player_name text, team_name text, og_number smallint, roles text[], is_admin boolean,
  created_at timestamptz, last_seen timestamptz, platforms text[], app_versions jsonb,
  push_enabled boolean, active_days bigint, sessions bigint, screens bigint,
  likes bigint, comments bigint, posts bigint, bets bigint, availability bigint, messages bigint,
  errors bigint, top_feature text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  d int := greatest(1, least(coalesce(p_days, 30), 90));
  since timestamptz := now() - make_interval(days => d);
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  return query
  with act as (select * from public.analytics_activity(since)),
  agg as (
    select a.user_id,
      count(distinct (a.ts at time zone 'Asia/Jerusalem')::date) active_days,
      count(*) filter (where a.kind = 'screen') screens,
      count(*) filter (where a.kind = 'like') likes,
      count(*) filter (where a.kind = 'comment') comments,
      count(*) filter (where a.kind = 'post') posts,
      count(*) filter (where a.kind = 'bet') bets,
      count(*) filter (where a.kind = 'availability') availability,
      count(*) filter (where a.kind = 'message') messages,
      count(*) filter (where a.kind = 'error') errors,
      max(a.ts) last_act
    from act a group by a.user_id
  ),
  topf as (
    select distinct on (a.user_id) a.user_id, a.feature
      from act a where a.feature is not null
     group by a.user_id, a.feature order by a.user_id, count(*) desc
  ),
  sess as (
    select s.user_id, max(s.updated_at) last_sess,
           array_agg(distinct public.analytics_platform(s.user_agent)) filter (where s.user_agent is not null) platforms
      from auth.sessions s group by s.user_id
  ),
  evsess as (
    select e.user_id, count(distinct e.session_id) sessions,
           array_agg(distinct e.platform) platforms, max(e.created_at) last_ev
      from public.app_events e where e.user_id is not null and e.created_at >= since group by e.user_id
  ),
  versions as (
    select v.user_id, jsonb_object_agg(v.platform, v.app_version) vers from (
      select distinct on (e.user_id, e.platform) e.user_id, e.platform, e.app_version
        from public.app_events e where e.user_id is not null and e.platform in ('ios', 'android') and e.app_version is not null
       order by e.user_id, e.platform, e.created_at desc) v
    group by v.user_id
  ),
  push as (select ps.user_id, true enabled from public.push_subscriptions ps group by ps.user_id),
  rl as (select ur.user_id, array_agg(distinct ur.role::text) roles from public.user_roles ur group by ur.user_id)
  select u.id, pr.display_name, u.email::text, pr.avatar_url,
         pl.id, nullif(trim(coalesce(pl.first_name, '') || ' ' || coalesce(pl.last_name, '')), ''), t.name, pl.og_number,
         coalesce(rl.roles, '{}'), exists (select 1 from public.admin_users au where lower(au.email) = lower(u.email)),
         u.created_at,
         greatest(sess.last_sess, evsess.last_ev, agg.last_act, u.last_sign_in_at),
         (select array_agg(distinct x) from unnest(coalesce(sess.platforms, '{}') || coalesce(evsess.platforms, '{}')) x where x is not null),
         versions.vers, coalesce(push.enabled, false),
         coalesce(agg.active_days, 0), coalesce(evsess.sessions, 0), coalesce(agg.screens, 0),
         coalesce(agg.likes, 0), coalesce(agg.comments, 0), coalesce(agg.posts, 0), coalesce(agg.bets, 0),
         coalesce(agg.availability, 0), coalesce(agg.messages, 0), coalesce(agg.errors, 0),
         topf.feature
    from auth.users u
    left join public.profiles pr on pr.id = u.id
    left join public.players pl on pl.id = pr.player_id
    left join public.teams t on t.id = pl.team_id
    left join agg on agg.user_id = u.id
    left join topf on topf.user_id = u.id
    left join sess on sess.user_id = u.id
    left join evsess on evsess.user_id = u.id
    left join versions on versions.user_id = u.id
    left join push on push.user_id = u.id
    left join rl on rl.user_id = u.id
   where not coalesce(pr.is_bot, false)
   order by 12 desc nulls last;
end $$;

-- ---------------------------------------------------------------------------
-- Everything about one person. { screens: [...], daily: [...], timeline: [...], devices: [...], push: [...], features: [...] }
create or replace function public.analytics_user_detail(p_user uuid, p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  d int := greatest(1, least(coalesce(p_days, 30), 90));
  since timestamptz := now() - make_interval(days => d);
  result jsonb;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  with act as (select * from public.analytics_activity(since) a where a.user_id = p_user)
  select jsonb_build_object(
    'features', (select coalesce(jsonb_agg(jsonb_build_object('feature', feature, 'events', n) order by n desc), '[]')
                   from (select feature, count(*) n from act where feature is not null group by feature) f),
    'screens', (select coalesce(jsonb_agg(jsonb_build_object('path', path, 'platform', platform, 'views', n) order by n desc), '[]')
                  from (select path, platform, count(*) n from act where kind = 'screen' group by path, platform order by n desc limit 30) s),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'events', n) order by day), '[]')
                from (select (ts at time zone 'Asia/Jerusalem')::date as day, count(*) n from act group by 1) x),
    'hours', (select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'events', n) order by h), '[]')
                from (select extract(hour from ts at time zone 'Asia/Jerusalem')::int h, count(*) n from act group by 1) x),
    'timeline', (select coalesce(jsonb_agg(jsonb_build_object('at', ts, 'kind', kind, 'platform', platform, 'feature', feature, 'path', path, 'detail', detail) order by ts desc), '[]')
                   from (select * from act order by ts desc limit 300) t),
    'sessions', (select coalesce(jsonb_agg(jsonb_build_object('session_id', session_id, 'platform', platform, 'version', app_version,
                        'start', s, 'end', e, 'screens', screens, 'events', n) order by s desc), '[]')
                   from (select ev.session_id, max(ev.platform) platform, max(ev.app_version) app_version, min(ev.created_at) s, max(ev.created_at) e,
                                count(*) filter (where ev.kind = 'page') screens, count(*) n
                           from public.app_events ev where ev.user_id = p_user and ev.created_at >= since
                          group by ev.session_id order by min(ev.created_at) desc limit 50) ss),
    'devices', (select coalesce(jsonb_agg(jsonb_build_object('platform', public.analytics_platform(s.user_agent), 'user_agent', left(s.user_agent, 160),
                        'created_at', s.created_at, 'last_seen', s.updated_at) order by s.updated_at desc), '[]')
                  from auth.sessions s where s.user_id = p_user),
    'push', (select coalesce(jsonb_agg(jsonb_build_object('platform', ps.platform, 'version', coalesce(ps.app_version_name, ps.app_version::text),
                     'created_at', ps.created_at, 'last_seen', ps.last_seen_at) order by ps.last_seen_at desc nulls last), '[]')
               from public.push_subscriptions ps where ps.user_id = p_user),
    'notifications', (select jsonb_build_object('received', count(*), 'read', count(read_at))
                        from public.notifications n where n.user_id = p_user and n.created_at >= since)
  ) into result;
  return result;
end $$;

-- ---------------------------------------------------------------------------
-- Feature adoption: of the users active in the window, how many used each feature.
create or replace function public.analytics_features(p_days int default 30)
returns table (feature text, users bigint, events bigint, web bigint, ios bigint, android bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 90)));
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  return query
  select a.feature, count(distinct a.user_id), count(*),
         count(distinct a.user_id) filter (where a.platform = 'web'),
         count(distinct a.user_id) filter (where a.platform = 'ios'),
         count(distinct a.user_id) filter (where a.platform = 'android')
    from public.analytics_activity(since) a
   where a.feature is not null and a.feature <> 'אחר'
   group by a.feature
   order by 2 desc;
end $$;

-- ---------------------------------------------------------------------------
-- Onboarding funnel over ALL accounts (not windowed): where do people stop?
create or replace function public.analytics_funnel()
returns table (step int, label text, users bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  return query
  with u as (
    select au.id, pr.player_id
      from auth.users au left join public.profiles pr on pr.id = au.id
     where not coalesce(pr.is_bot, false)
  )
  select 1, 'נרשמו', count(*) from u
  union all select 2, 'שויכו לכרטיס שחקן', count(*) from u where u.player_id is not null
  union all select 3, 'העלו בדיקה רפואית', count(*) from u
     where u.player_id is not null and exists (select 1 from public.medical_certificates m where m.player_id = u.player_id)
  union all select 4, 'בדיקה רפואית אושרה', count(*) from u
     where u.player_id is not null and exists (select 1 from public.medical_certificates m where m.player_id = u.player_id and m.status = 'approved')
  union all select 5, 'אישרו הגעה למשחק', count(*) from u
     where u.player_id is not null and exists (select 1 from public.game_availability a where a.player_id = u.player_id)
  union all select 6, 'התקינו את האפליקציה', count(*) from u
     where exists (select 1 from auth.sessions s where s.user_id = u.id and public.analytics_platform(s.user_agent) in ('ios', 'android'))
  union all select 7, 'הפעילו התראות', count(*) from u
     where exists (select 1 from public.push_subscriptions ps where ps.user_id = u.id)
  order by 1;
end $$;

-- ---------------------------------------------------------------------------
-- Weekly retention: accounts grouped by signup week; for each later week, how many were
-- active (any activity or session touch). Last 12 cohorts, up to 8 weeks out.
create or replace function public.analytics_retention()
returns table (cohort date, size bigint, week int, active bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  return query
  with users as (
    select au.id, date_trunc('week', au.created_at at time zone 'Asia/Jerusalem')::date cohort
      from auth.users au left join public.profiles pr on pr.id = au.id
     where not coalesce(pr.is_bot, false)
       and au.created_at >= date_trunc('week', now()) - interval '11 weeks'
  ),
  touches as (
    select a.user_id, a.ts as ts from public.analytics_activity(date_trunc('week', now()) - interval '11 weeks') a
    union all select s.user_id, s.updated_at as ts from auth.sessions s
    union all select s.user_id, s.created_at from auth.sessions s
  ),
  wk as (
    select distinct u.id, u.cohort,
           ((date_trunc('week', t.ts at time zone 'Asia/Jerusalem')::date - u.cohort) / 7)::int week
      from users u join touches t on t.user_id = u.id
  )
  select c.cohort, c.size, w.week, count(distinct wk.id)
    from (select u.cohort, count(*) size from users u group by u.cohort) c
   cross join generate_series(0, 8) w(week)
    left join wk on wk.cohort = c.cohort and wk.week = w.week
   where c.cohort + w.week * 7 <= (now() at time zone 'Asia/Jerusalem')::date
   group by c.cohort, c.size, w.week
   order by c.cohort desc, w.week;
end $$;

-- ---------------------------------------------------------------------------
-- When: day-of-week × hour (Israel time). dow 0 = Sunday.
create or replace function public.analytics_heatmap(p_days int default 30)
returns table (dow int, hour int, users bigint, events bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 90)));
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  return query
  select extract(dow from a.ts at time zone 'Asia/Jerusalem')::int,
         extract(hour from a.ts at time zone 'Asia/Jerusalem')::int,
         count(distinct a.user_id), count(*)
    from public.analytics_activity(since) a
   group by 1, 2;
end $$;

-- ---------------------------------------------------------------------------
-- App versions in use: each app user's latest known version, per platform.
create or replace function public.analytics_versions()
returns table (platform text, version text, users bigint, last_seen timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  return query
  with latest as (
    select distinct on (x.user_id, x.platform) x.user_id, x.platform, x.version, x.ts from (
      select e.user_id, e.platform, e.app_version as version, e.created_at as ts
        from public.app_events e where e.user_id is not null and e.platform in ('ios', 'android') and e.app_version is not null
      union all
      -- same "1.4.6 (33)" format app_events uses
      select ps.user_id, ps.platform, ps.app_version_name || ' (' || ps.app_version || ')', ps.last_seen_at
        from public.push_subscriptions ps
       where ps.platform in ('ios', 'android') and ps.app_version_name is not null and ps.app_version is not null
    ) x
    where x.ts is not null
    order by x.user_id, x.platform, x.ts desc
  )
  select l.platform, l.version, count(*), max(l.ts)
    from latest l group by l.platform, l.version
   order by 1, 4 desc;
end $$;

-- ---------------------------------------------------------------------------
-- Friction: the screens where signed-in users hit errors (noise excluded).
create or replace function public.analytics_errors(p_days int default 7)
returns table (name text, path text, platform text, events bigint, users bigint, last_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 90)));
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  return query
  select e.name, e.path, e.platform, count(*), count(distinct coalesce(e.user_id::text, e.session_id)), max(e.created_at)
    from public.app_events e
   where e.kind = 'error' and e.created_at >= since
     and e.name not in ('request_cancelled', 'asset_error')
   group by 1, 2, 3
   order by 4 desc
   limit 40;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'analytics_overview(int)', 'analytics_users(int)', 'analytics_user_detail(uuid, int)',
    'analytics_features(int)', 'analytics_funnel()', 'analytics_retention()',
    'analytics_heatmap(int)', 'analytics_versions()', 'analytics_errors(int)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
