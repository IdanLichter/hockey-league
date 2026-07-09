-- ============================================================================
-- Stage B0 rollback — drops everything created by accounts-schema.sql.
-- Touches no pre-existing object. Run to fully reverse Stage B0.
-- ============================================================================
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

drop table if exists public.posts cascade;       -- drops its triggers/policies
drop table if exists public.user_roles cascade;
drop table if exists public.profiles cascade;     -- drops its triggers/policies

drop function if exists public.guard_profile_player_id();
drop function if exists public.can_post();
drop function if exists public.is_admin();
drop function if exists public.set_updated_at();
