-- Human-readable Hebrew slugs for the URLs that used to be raw UUIDs.
--
--   /players/d95bd629-92bb-46d1-b92c-60aafeebfa6c  ->  /players/יואב-תורגמן
--   /teams/…                                       ->  /teams/קריית-ביאליק
--   /games/…                                       ->  /games/2026-09-12-בלג-בוגרים-נגד-רמת-ישי
--
-- Two invariants this file exists to protect:
--
--  1. NO LINK EVER DIES. Everything shared into the league's WhatsApp groups,
--     stored as a notifications.entity_id, or indexed by Google is a UUID. The
--     UUID form keeps resolving forever (api/resolve.js 308s it to the slug),
--     and every slug a row has ever carried is kept in entity_slug_history so a
--     rescheduled game's old link still lands on the right page.
--
--  2. SLUGS ARE ASSIGNED BY A TRIGGER, NOT BY THE APP. Players and games are
--     also written by the native admin screens, the judge flow, the fixture
--     generator and by hand over MCP. App-side generation would miss all of
--     those and leave slug-less rows that silently fall back to UUID URLs.

-- ---------------------------------------------------------------------------
-- slugify_he: text -> URL slug, Hebrew kept as Hebrew
-- ---------------------------------------------------------------------------
-- Hebrew has no transliteration we could do automatically: unvowelled יואב has
-- no single right Latin spelling, so the slug stays in the alphabet the whole
-- league actually reads. Percent-encoding is a display artifact of some
-- browsers' copy behaviour; the address bar, Google's results and WhatsApp's
-- preview card all render it as Hebrew.
--
--   ' nikud and geresh are DELETED, not separated: תורג'מן -> תורגמן, שָׁלוֹם -> שלום.
--   ' everything else that isn't a Hebrew letter or ASCII alphanumeric becomes '-'.
--   ' returns NULL (not '') for input with nothing slug-able in it, so the
--     caller can fall back to the UUID rather than write an empty slug.
create or replace function public.slugify_he(src text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(both '-' from
      regexp_replace(
        regexp_replace(
          -- U+0591..U+05C7 nikud/cantillation, U+05F3/U+05F4 geresh/gershayim,
          -- and the ASCII quotes people type instead of them.
          lower(regexp_replace(coalesce(src, ''), '[֑-ׇ׳״''"]', '', 'g')),
          '[^א-תa-z0-9]+', '-', 'g'),
        '-{2,}', '-', 'g')),
    '')
$$;

-- Pinned search_path: it only calls built-ins, but an unpinned one trips the
-- Supabase security advisor and costs nothing to fix.
alter function public.slugify_he(text) set search_path = pg_catalog, public;

comment on function public.slugify_he(text) is
  'Hebrew-preserving URL slug. Strips nikud and geresh, collapses everything else to "-". NULL when nothing slug-able remains.';

-- ---------------------------------------------------------------------------
-- entity_slug_history: every slug a row has ever had
-- ---------------------------------------------------------------------------
-- A game gets rescheduled (a first-class feature here — see game change
-- requests), a player's name typo gets fixed, and the slug changes. Without
-- this table the link someone pasted into the group chat last week would start
-- 404ing. api/resolve.js reads it and 308s to the current slug.
--
-- markets are deliberately NOT recorded here: market titles are RLS-gated to
-- 18+ league players, and this table is anon-readable by design.
create table if not exists public.entity_slug_history (
  entity_type  text        not null check (entity_type in ('teams', 'players', 'games', 'tournaments', 'seasons')),
  slug         text        not null,
  entity_id    uuid        not null,
  replaced_at  timestamptz not null default now(),
  primary key (entity_type, slug)
);

create index if not exists entity_slug_history_entity_idx
  on public.entity_slug_history (entity_type, entity_id);

alter table public.entity_slug_history enable row level security;

-- Public read: it holds nothing that isn't already on a public page, and the
-- anon-key resolver needs it to redirect old links.
drop policy if exists entity_slug_history_read on public.entity_slug_history;
create policy entity_slug_history_read on public.entity_slug_history
  for select using (true);

-- No write policies at all. Only assign_slug() writes here, and it is
-- SECURITY DEFINER, so it bypasses RLS.

-- ---------------------------------------------------------------------------
-- slug columns
-- ---------------------------------------------------------------------------
alter table public.teams        add column if not exists slug text;
alter table public.players      add column if not exists slug text;
alter table public.games        add column if not exists slug text;
alter table public.tournaments  add column if not exists slug text;
alter table public.markets      add column if not exists slug text;
alter table public.seasons      add column if not exists slug text;

create unique index if not exists teams_slug_key       on public.teams (slug);
create unique index if not exists players_slug_key     on public.players (slug);
create unique index if not exists games_slug_key       on public.games (slug);
create unique index if not exists tournaments_slug_key on public.tournaments (slug);
create unique index if not exists markets_slug_key     on public.markets (slug);
create unique index if not exists seasons_slug_key     on public.seasons (slug);

-- players is the one table here with COLUMN-level grants for anon: birth_date is
-- deliberately withheld from the public (minors' DOB). A column-level GRANT
-- covers only the columns that existed when it was written, so `slug` arrives
-- un-granted — and the moment PLAYER_PUBLIC_COLUMNS asks for it, the entire
-- public player list 401s for logged-out visitors. Every other table here has a
-- table-level grant, so slug came along for free.
grant select (slug) on public.players to anon;

-- ---------------------------------------------------------------------------
-- assign_slug(): one BEFORE trigger for all six tables
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER for two reasons: the games branch reads teams.name (the
-- fixture generator and the judge flow both insert games under roles whose
-- read scope we don't want to depend on), and the history insert must bypass
-- the write-less RLS above.
create or replace function public.assign_slug()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rec   jsonb;
  rid   uuid;
  base  text;
  cand  text;
  n     int := 1;
  taken boolean;
  ety   text := tg_table_name;
begin
  -- Fields are read out of to_jsonb(new), not as new.<col>. One trigger
  -- function serves six tables, and PL/pgSQL resolves every new.<col> in the
  -- body against the ACTUAL record type at run time -- even the branches of a
  -- CASE that will not be taken. A literal `new.title` therefore aborts the
  -- teams trigger with 42703 before the CASE ever picks a branch.
  rec := to_jsonb(new);
  rid := (rec->>'id')::uuid;

  base := case tg_table_name
    when 'teams'       then public.slugify_he(rec->>'name')
    when 'tournaments' then public.slugify_he(rec->>'name')
    -- Season names are already slug-shaped ("2025-26"); /archive/2025-26.
    when 'seasons'     then public.slugify_he(rec->>'name')
    when 'markets'     then public.slugify_he(rec->>'title')
    when 'players'     then public.slugify_he(concat_ws(' ', rec->>'first_name', rec->>'last_name'))
    when 'games'       then public.slugify_he(concat_ws(' ',
                              to_char((rec->>'game_date')::timestamptz at time zone 'Asia/Jerusalem', 'YYYY-MM-DD'),
                              coalesce((select t.name from public.teams t where t.id = (rec->>'home_team_id')::uuid), 'בית'),
                              'נגד',
                              coalesce((select t.name from public.teams t where t.id = (rec->>'away_team_id')::uuid), 'חוץ')))
  end;

  -- Nothing slug-able (a team named only in punctuation, a game with no date).
  -- Leave slug NULL; the app falls back to the UUID URL, which never stopped
  -- working. Better than inventing a meaningless slug.
  if base is null then
    new.slug := null;
    return new;
  end if;

  -- Already on an acceptable slug for this base? Keep it. Without this, a
  -- no-op update on the second עידו ריכטר would recompute base 'עידו-ריכטר',
  -- find it taken by the first, and churn the row onto '-3', '-4', … on every
  -- save — archiving a perfectly good slug each time.
  -- (LIKE rather than a built regex: slugify_he only ever emits Hebrew letters,
  -- a-z, 0-9 and '-', so `base` can hold no LIKE or regex metacharacter.)
  if tg_op = 'UPDATE' and old.slug is not null
     and (old.slug = base
          or (old.slug like (base || '-%')
              and substring(old.slug from length(base) + 2) ~ '^[0-9]+$'))
  then
    new.slug := old.slug;
    return new;
  end if;

  -- Collision suffix. Not hypothetical: עידו ריכטר is already two different
  -- people. Checked against live slugs AND history, so a recycled slug can
  -- never steal an old link's destination.
  cand := base;
  loop
    execute format('select exists (select 1 from public.%I where slug = $1 and id <> $2)', tg_table_name)
      into taken using cand, rid;

    if not taken and ety <> 'markets' then
      select exists (
        select 1 from public.entity_slug_history h
        where h.entity_type = ety and h.slug = cand and h.entity_id <> rid
      ) into taken;
    end if;

    exit when not taken;
    n := n + 1;
    cand := base || '-' || n;
  end loop;

  new.slug := cand;

  if tg_op = 'UPDATE' and old.slug is not null and old.slug <> new.slug and ety <> 'markets' then
    insert into public.entity_slug_history (entity_type, slug, entity_id)
    values (ety, old.slug, rid)
    on conflict (entity_type, slug)
      do update set entity_id = excluded.entity_id, replaced_at = now();
  end if;

  return new;
end;
$$;

-- UPDATE OF <source columns, slug>: a reschedule or a rename re-slugs (old slug
-- goes to history); everything else leaves the slug alone. 'slug' is in each
-- list so the backfill below fires the trigger.
drop trigger if exists trg_assign_slug on public.teams;
create trigger trg_assign_slug before insert or update of name, slug
  on public.teams for each row execute function public.assign_slug();

drop trigger if exists trg_assign_slug on public.players;
create trigger trg_assign_slug before insert or update of first_name, last_name, slug
  on public.players for each row execute function public.assign_slug();

drop trigger if exists trg_assign_slug on public.games;
create trigger trg_assign_slug before insert or update of game_date, home_team_id, away_team_id, slug
  on public.games for each row execute function public.assign_slug();

drop trigger if exists trg_assign_slug on public.tournaments;
create trigger trg_assign_slug before insert or update of name, slug
  on public.tournaments for each row execute function public.assign_slug();

drop trigger if exists trg_assign_slug on public.markets;
create trigger trg_assign_slug before insert or update of title, slug
  on public.markets for each row execute function public.assign_slug();

drop trigger if exists trg_assign_slug on public.seasons;
create trigger trg_assign_slug before insert or update of name, slug
  on public.seasons for each row execute function public.assign_slug();

-- assign_slug is SECURITY DEFINER, so PostgREST would otherwise expose it at
-- /rest/v1/rpc/assign_slug to anon and authenticated. Called outside a trigger
-- it errors rather than doing anything, but a definer-rights function should
-- not be reachable from the public API at all. Triggers invoke it through the
-- table, not via EXECUTE on the caller's behalf, so this does not affect them.
revoke execute on function public.assign_slug() from public;
revoke execute on function public.assign_slug() from anon;
revoke execute on function public.assign_slug() from authenticated;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------
-- `set slug = slug` is a self-assignment whose only job is to fire the
-- `before update of slug` trigger, which then fills the value in.
--
-- `where slug is null` is load-bearing in two ways: it makes the statement
-- re-runnable (and scopes it to rows that have nothing to lose), and it is a
-- predicate PG17 will not fold away. `where id is not null` gets folded, which
-- turns this into a bare UPDATE — and safeupdate, preloaded for the
-- `authenticator` role, rejects those outright.
update public.teams       set slug = slug where slug is null;
update public.players     set slug = slug where slug is null;
update public.games       set slug = slug where slug is null;
update public.tournaments set slug = slug where slug is null;
update public.markets     set slug = slug where slug is null;
update public.seasons     set slug = slug where slug is null;
