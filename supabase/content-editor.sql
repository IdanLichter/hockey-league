-- ============================================================================
-- content_editor role powers (2026-07-11): moderation + photo-override +
-- cluster management + album submissions. Predicates below match the LIVE
-- policies (verified via pg_policies, not the possibly-stale snapshot).
-- NOTE: these `is_admin()` policies are slated for a FOR-ALL→write-verb split in
-- the deferred RLS-hardening plan (supabase/rls-hardening.sql) — carry the
-- `OR is_content_editor()` through when that lands.
-- ============================================================================

-- Helper, mirroring is_judge(). Executable by anon too (returns false when
-- signed-out) because it's referenced in anon-evaluated public-read policies.
create or replace function public.is_content_editor()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles ur
       where ur.user_id = auth.uid() and ur.role = 'content_editor') $$;
grant execute on function public.is_content_editor() to anon, authenticated;

-- ---- moderation: posts / comments / feed_item_comments ---------------------
alter policy "Author or admin delete"  on public.posts using ((author_id = auth.uid()) or is_admin() or is_content_editor());
alter policy "Public read posts"       on public.posts using ((deleted_at is null) or is_admin() or is_content_editor());
alter policy "Author or admin update"  on public.posts using ((author_id = auth.uid()) or is_admin() or is_content_editor()) with check ((author_id = auth.uid()) or is_admin() or is_content_editor());

alter policy "Author or admin delete comment" on public.comments using ((author_id = auth.uid()) or is_admin() or is_content_editor());
alter policy "Public read comments"           on public.comments using ((deleted_at is null) or is_admin() or is_content_editor());
alter policy "Author or admin update comment" on public.comments using ((author_id = auth.uid()) or is_admin() or is_content_editor()) with check ((author_id = auth.uid()) or is_admin() or is_content_editor());

alter policy "Author or admin delete item comment" on public.feed_item_comments using ((author_id = auth.uid()) or is_admin() or is_content_editor());
alter policy "Public read feed_item_comments"      on public.feed_item_comments using ((deleted_at is null) or is_admin() or is_content_editor());
alter policy "Author or admin update item comment" on public.feed_item_comments using ((author_id = auth.uid()) or is_admin() or is_content_editor()) with check ((author_id = auth.uid()) or is_admin() or is_content_editor());

-- ---- moderation: content_reports (resolve + read the queue) -----------------
alter policy "report read own or admin" on public.content_reports using ((reporter_id = auth.uid()) or is_admin() or is_content_editor());
alter policy "report admin update"      on public.content_reports using (is_admin() or is_content_editor()) with check (is_admin() or is_content_editor());

-- ---- photo overrides (refresh a post's chosen image) ------------------------
alter policy "Admin write feed_photo_overrides" on public.feed_photo_overrides using (is_admin() or is_content_editor()) with check (is_admin() or is_content_editor());

-- ---- face clusters (name/resolve/reopen/hide + see hidden) ------------------
alter policy "Admin manage clusters" on public.face_clusters using (is_admin() or is_content_editor()) with check (is_admin() or is_content_editor());
alter policy "Public read clusters"  on public.face_clusters using ((status <> 'hidden'::text) or is_admin() or is_content_editor());
alter policy "Admin delete suggestions" on public.cluster_suggestions using (is_admin() or is_content_editor());

-- ---- album submissions queue (offline pipeline drains it) -------------------
create table if not exists public.album_submissions (
  id           uuid primary key default gen_random_uuid(),
  url          text not null check (char_length(url) between 5 and 2000),
  source       text,
  note         text,
  status       text not null default 'pending' check (status in ('pending','processing','done','rejected')),
  submitted_by uuid references auth.users(id) on delete set null,
  reviewed_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists album_submissions_status_idx on public.album_submissions(status, created_at desc);
alter table public.album_submissions enable row level security;

drop policy if exists "editors submit albums" on public.album_submissions;
drop policy if exists "editors read albums"   on public.album_submissions;
drop policy if exists "editors update albums" on public.album_submissions;
create policy "editors submit albums" on public.album_submissions for insert to authenticated
  with check ((is_admin() or is_content_editor()) and submitted_by = auth.uid());
create policy "editors read albums" on public.album_submissions for select to authenticated
  using (is_admin() or is_content_editor());
create policy "editors update albums" on public.album_submissions for update to authenticated
  using (is_admin() or is_content_editor()) with check (is_admin() or is_content_editor());
