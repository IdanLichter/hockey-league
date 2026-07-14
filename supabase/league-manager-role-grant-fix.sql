-- league-manager-role-grant-fix.sql
--
-- Context: the "league_manager" role was added in prod migration
-- 20260712202515_league_manager_role, which created is_league_manager()
-- (SECURITY DEFINER) and rewired the `tournaments` "manage" RLS policy to
-- `using (is_admin() or is_league_manager())`. That migration, however,
-- never extended the user_roles CHECK constraint — so the role was enforced
-- everywhere but could NOT be granted: inserting {role: 'league_manager'}
-- into public.user_roles failed with check-constraint violation 23514, which
-- the admin Roles tab surfaced as a generic "שגיאה בהענקת התפקיד".
--
-- This migration widens the constraint so admins can actually assign it.
-- Applied to prod via MCP as migration user_roles_allow_league_manager.

alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role = any (array['player','coach','content_editor','judge','league_manager']));
