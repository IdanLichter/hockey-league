-- Admin override for the photo auto-attached to a synthetic feed card.
-- Applied to production as migration `feed_photo_overrides` (2026-07-10).
--
-- item_key is the feed card's id, the same key feed_item_likes / feed_item_comments
-- use: 'game-<uuid>', 'ms-<uuid>-p<uuid>', 'champion', 'top-scorer'.
-- photo_id NULL means "render no photo on this card".
--
-- set_by deliberately carries NO foreign key to profiles: a second FK path into
-- profiles is what made bare PostgREST embeds ambiguous (PGRST201) and took the
-- site down once already. Keep it a plain uuid.

create table if not exists public.feed_photo_overrides (
  item_key   text primary key,
  photo_id   text references public.photos(photo_id) on delete cascade,
  set_by     uuid,
  updated_at timestamptz not null default now()
);

alter table public.feed_photo_overrides enable row level security;

-- The feed renders for anonymous visitors, so the override must be publicly readable.
create policy "Public read feed_photo_overrides"
  on public.feed_photo_overrides for select using (true);

create policy "Admin write feed_photo_overrides"
  on public.feed_photo_overrides for all
  using (public.is_admin()) with check (public.is_admin());
