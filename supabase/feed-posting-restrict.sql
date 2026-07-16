-- Restrict feed posting to league staff (2026-07-16).
-- Before: any authenticated user could create a post. After: only coaches,
-- content-editors, judges (= referees), league-managers, and admins.
-- The client Composer (src/components/feed/Composer.jsx) enforces the same rule via
-- AuthContext.canPost; this policy is the authoritative server-side gate.
-- Applied to prod via MCP migration `restrict_feed_posting_to_staff`.

-- Global "is this user a coach of ANY team" helper (mirrors is_judge()/is_league_manager();
-- distinct from the existing team-scoped is_coach_of(team)).
create or replace function public.is_coach()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'coach'
  );
$$;
revoke all on function public.is_coach() from public, anon;
grant execute on function public.is_coach() to authenticated;

drop policy if exists "Authenticated insert own posts" on public.posts;
create policy "Staff insert own posts" on public.posts
  as permissive for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      public.is_admin()
      or public.is_coach()
      or public.is_content_editor()
      or public.is_judge()
      or public.is_league_manager()
    )
  );
