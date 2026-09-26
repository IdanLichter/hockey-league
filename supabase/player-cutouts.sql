-- ============================================================================
-- Player cutouts — background-removed player images for the Friday preview poster
-- (supabase/functions/weekly-preview). Generated offline from the league's game
-- albums by hockey-photos/make_cutouts.py (rembg + the face-recognition index),
-- then approved by a human: the automatic pass also produces referees, spectators
-- and half-cut third people, so NOTHING is used until status = 'approved'.
--
-- player_ids has one id (a solo cutout) or two (a "duo": two recognized players
-- touching in the photo). A duo with one player from each side of a fixture is the
-- matchup's hero image.
--
-- Minors are excluded at generation time (birth_date < 18y) — a promo poster is a
-- different use than the match album they came from.
-- ============================================================================
create table if not exists public.player_cutouts (
  id              uuid primary key default gen_random_uuid(),
  player_ids      uuid[] not null check (cardinality(player_ids) between 1 and 2),
  image_url       text not null,
  source_photo_id text,
  status          text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at      timestamptz not null default now()
);
create index if not exists player_cutouts_player_ids_gin on public.player_cutouts using gin (player_ids);

alter table public.player_cutouts enable row level security;

drop policy if exists player_cutouts_read_approved on public.player_cutouts;
create policy player_cutouts_read_approved on public.player_cutouts
  for select to anon, authenticated using (status = 'approved' or public.is_admin());

drop policy if exists player_cutouts_admin_write on public.player_cutouts;
create policy player_cutouts_admin_write on public.player_cutouts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Public bucket (the poster hotlinks them while rendering); writes = service role only.
insert into storage.buckets (id, name, public)
values ('player-cutouts', 'player-cutouts', true)
on conflict (id) do nothing;

-- ---------- rollback ----------
-- drop table if exists public.player_cutouts;
-- delete from storage.objects where bucket_id = 'player-cutouts';
-- delete from storage.buckets where id = 'player-cutouts';
