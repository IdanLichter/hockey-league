-- ============================================================================
-- RLS hardening (2026-07-11). DONE portion — high-value, low-risk, isolated.
-- The large 70-policy rewrite is deliberately DEFERRED (see the note at the end).
-- ============================================================================

-- 1) admin_users roster leak (High, security) — ⚠️ REVERTED 2026-07-12.
--    The attempted lockdown below set the SELECT policy to `is_admin()`. But
--    is_admin() ITSELF reads admin_users (`... in (select email from admin_users)`),
--    so through PostgREST (role `authenticated`, no RLS bypass) it caused
--    `infinite recursion detected in policy for relation "admin_users"` → 500 on
--    EVERY admin_users query, including the write policies' subqueries → the admin
--    console broke (couldn't list or add admins). A direct MCP test masked it
--    (that connection bypasses RLS). REVERTED to the original non-recursive policy:
--        create policy "Auth users check admin status" on public.admin_users
--          for select to authenticated using (auth.role() = 'authenticated');
--    TO CLOSE THE LEAK NON-RECURSIVELY (future): SELECT policy = own row only
--    (`email = (auth.jwt()->>'email')`) + a SECURITY DEFINER `list_admins()` RPC
--    for the management list (frontend getAdminUsers → rpc). Do NOT put a
--    self-referential read (is_admin / select from admin_users) in the SELECT policy.

-- 2) Missing FK indexes (perf, additive/zero-risk) — speeds joins + cascade deletes.
create index if not exists idx_archived_game_stats_archived_game_id on public.archived_game_stats(archived_game_id);
create index if not exists idx_archived_player_stats_player_id      on public.archived_player_stats(player_id);
create index if not exists idx_archived_team_standings_team_id      on public.archived_team_standings(team_id);
create index if not exists idx_cluster_suggestions_suggested_by     on public.cluster_suggestions(suggested_by);
create index if not exists idx_comments_author_id                  on public.comments(author_id);
create index if not exists idx_content_reports_reviewed_by         on public.content_reports(reviewed_by);
create index if not exists idx_face_clusters_player_id             on public.face_clusters(player_id);
create index if not exists idx_feed_item_comments_author_id        on public.feed_item_comments(author_id);
create index if not exists idx_feed_item_likes_user_id             on public.feed_item_likes(user_id);
create index if not exists idx_feed_photo_overrides_photo_id       on public.feed_photo_overrides(photo_id);
create index if not exists idx_notifications_actor_id              on public.notifications(actor_id);
create index if not exists idx_player_claims_reviewed_by           on public.player_claims(reviewed_by);
create index if not exists idx_post_likes_user_id                  on public.post_likes(user_id);
create index if not exists idx_user_blocks_blocked_id              on public.user_blocks(blocked_id);

-- ----------------------------------------------------------------------------
-- DEFERRED (needs a supervised session + rollback plan):
--   * Wrap every policy's auth.*() in a scalar subselect (auth_rls_initplan, ~36).
--   * Split the ~70 `FOR ALL ... USING(is_admin())` policies into write-only
--     verbs so is_admin() is no longer evaluated on anon SELECT paths
--     (multiple_permissive_policies, ~70 tables).
--   * Then REVOKE EXECUTE on is_admin()/is_coach_of() FROM anon.
-- These touch ~24 tables at once; a wrong predicate takes the live site down,
-- and they're PERFORMANCE advisories on a tiny DB (low urgency). Do them with a
-- human online, applying + re-testing anon reads per table. NOT done autonomously.
-- ----------------------------------------------------------------------------
