-- team-admin-manager-down.sql
-- Reverses team-admin-manager.sql: drop the delete guard and the manager write
-- policy, returning team writes to admin-only. (Any teams a manager already
-- created stay; this only removes the going-forward capability + the guard.)

drop trigger if exists trg_guard_team_delete on public.teams;
drop function if exists public.guard_team_delete();
drop policy if exists "Manager write teams" on public.teams;
