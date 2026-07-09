-- ============================================================================
-- Stage B2 — comments + likes  (applied to live DB as migration
-- `stage_b2_comments_and_likes`, 2026-07-09). Builds on accounts-schema.sql (B0).
--
-- ⚠️ GOTCHA: both tables FK to profiles. That adds extra posts↔profiles relationship
-- paths (posts→post_likes→profiles, posts→comments→profiles) on top of the direct
-- posts.author_id→profiles, so a bare `author:profiles(...)` PostgREST embed becomes
-- AMBIGUOUS (PGRST201). All post/comment author embeds MUST pin the FK explicitly:
--   author:profiles!posts_author_id_fkey(...)   /   author:profiles!comments_author_id_fkey(...)
-- (see src/lib/api.js). Adding this migration without that hint blanked the live feed.
-- ============================================================================

-- ---------- post_likes ----------
create table public.post_likes (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index post_likes_post_idx on public.post_likes(post_id);

alter table public.post_likes enable row level security;
create policy "Public read post_likes" on public.post_likes
  for select using (true);
create policy "Authenticated like as self" on public.post_likes
  for insert to authenticated with check (user_id = auth.uid());
create policy "Authenticated unlike own" on public.post_likes
  for delete to authenticated using (user_id = auth.uid());

-- ---------- comments ----------
create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index comments_post_idx on public.comments(post_id, created_at);

alter table public.comments enable row level security;
create policy "Public read comments" on public.comments
  for select using (deleted_at is null or public.is_admin());
create policy "Authenticated comment as self" on public.comments
  for insert to authenticated with check (author_id = auth.uid());
create policy "Author or admin update comment" on public.comments
  for update using (author_id = auth.uid() or public.is_admin())
             with check (author_id = auth.uid() or public.is_admin());
create policy "Author or admin delete comment" on public.comments
  for delete using (author_id = auth.uid() or public.is_admin());

-- ---------- rollback ----------
-- drop table if exists public.post_likes cascade;
-- drop table if exists public.comments cascade;
