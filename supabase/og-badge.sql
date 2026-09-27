-- OG badge (2026-09-28)
--
-- The league's account posted that the first 25 players to link their account to their
-- player card get a reward. Ariel hand-picked the 25 (players only — no coaches, league
-- managers or referees) and chose the name "OG". Each gets a permanent number, #1..#25,
-- shown as an "OG #N" badge next to their name, plus a one-time surprise screen the next
-- time they open the site/app.
--
-- players.og_number  — public (anon + authenticated), unique, 1..25. Hand-assigned below;
--                      nothing assigns it automatically.
-- players.og_seen_at — when the linked account dismissed the surprise screen. NOT granted
--                      to clients; read/written only through my_og() / ack_og().
--
-- Rollback: og-badge-down.sql

alter table public.players
  add column if not exists og_number smallint,
  add column if not exists og_seen_at timestamptz;

do $$ begin
  alter table public.players add constraint players_og_number_range check (og_number between 1 and 25);
exception when duplicate_object then null; end $$;
create unique index if not exists players_og_number_key on public.players (og_number) where og_number is not null;

-- players has column-level grants (no table-level SELECT) — the badge shows to everyone.
grant select (og_number) on public.players to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The signed-in user's own OG state. { number: int|null, seen: bool }
create or replace function public.my_og()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select jsonb_build_object('number', p.og_number, 'seen', p.og_seen_at is not null)
       from public.profiles pr
       join public.players p on p.id = pr.player_id
      where pr.id = auth.uid()),
    jsonb_build_object('number', null, 'seen', true));
$$;

-- Dismiss the surprise screen. Only ever stamps the caller's own linked player, and only once.
create or replace function public.ack_og()
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.players p set og_seen_at = now()
    from public.profiles pr
   where pr.id = auth.uid() and p.id = pr.player_id
     and p.og_number is not null and p.og_seen_at is null;
$$;

revoke all on function public.my_og() from public, anon;
revoke all on function public.ack_og() from public, anon;
grant execute on function public.my_og() to authenticated;
grant execute on function public.ack_og() to authenticated;

-- ---------------------------------------------------------------------------
-- The 25, in link order.
update public.players p set og_number = v.n
  from (values
    (1,  '3f5928e0-d9f3-442e-9f89-cfba9397e189'::uuid), -- עידו רובשקין
    (2,  'b2000004-0000-0000-0000-000000000004'),       -- אלעד תורן
    (3,  'b2000010-0000-0000-0000-000000000010'),       -- יובל נידם
    (4,  'b3000006-0000-0000-0000-000000000006'),       -- ליעד דוד
    (5,  'b2000003-0000-0000-0000-000000000003'),       -- אסף קרן צור
    (6,  'b1000003-0000-0000-0000-000000000003'),       -- אמיר ארמוני
    (7,  'b1000008-0000-0000-0000-000000000008'),       -- יובל טפירו
    (8,  'b3000008-0000-0000-0000-000000000008'),       -- חן דוידסקו
    (9,  'b2000001-0000-0000-0000-000000000001'),       -- עומר סטולר
    (10, 'b1000010-0000-0000-0000-000000000010'),       -- עומר כהן
    (11, '0ec7673e-fbb7-4e94-9e33-978791a82e74'),       -- ניל שור
    (12, 'b1000007-0000-0000-0000-000000000007'),       -- אלון בן אריה
    (13, 'b2000011-0000-0000-0000-000000000011'),       -- יואב כץ ממן
    (14, 'b5000003-0000-0000-0000-000000000003'),       -- אורי רייזלר
    (15, 'b6000013-0000-0000-0000-000000000013'),       -- תומר נועם
    (16, 'b1000011-0000-0000-0000-000000000011'),       -- עידו זינגר
    (17, 'b6000012-0000-0000-0000-000000000012'),       -- נועם ויינשטיין
    (18, 'b6000003-0000-0000-0000-000000000003'),       -- עופר אלקין
    (19, 'f6c296e9-c33b-478d-90c5-607a82fc082c'),       -- אביעד גיגי
    (20, 'b4000009-0000-0000-0000-000000000009'),       -- שחר דהן
    (21, 'b7000013-0000-0000-0000-000000000013'),       -- איתי רגב
    (22, 'b7000004-0000-0000-0000-000000000004'),       -- עידן לבייב
    (23, 'b7000007-0000-0000-0000-000000000007'),       -- גלי חליווה
    (24, 'b7000005-0000-0000-0000-000000000005'),       -- בר פוטרמן
    (25, 'd43d8ce2-490a-4bb8-a124-948501b0852c')        -- הראל יונאי
  ) as v(n, id)
 where p.id = v.id;
