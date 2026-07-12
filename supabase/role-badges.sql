-- Public role badges — lets the UI show a member's league role next to their
-- name (post authors, player pages) even though user_roles is "read own or
-- admin" only. Additive + read-only: a SECURITY DEFINER function that returns,
-- per requested user, whether they are an admin plus their public "title" roles
-- (coach / content_editor / judge). It does NOT expose the admin_users list or
-- any emails — only a per-user boolean for users you already looked up.
--
-- Display rule (enforced client-side in deriveRoleItems): an admin shows ONLY
-- "מנהל" (admin implies the rest); a non-admin shows every role they hold.

create or replace function public.public_role_badges(p_user_ids uuid[])
returns table (user_id uuid, is_admin boolean, roles jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.id as user_id,
    (u.email in (select a.email from public.admin_users a)) as is_admin,
    coalesce(
      (select jsonb_agg(distinct jsonb_build_object('role', ur.role, 'team_id', ur.team_id))
         from public.user_roles ur
        where ur.user_id = u.id
          and ur.role in ('coach', 'content_editor', 'judge')),
      '[]'::jsonb
    ) as roles
  from auth.users u
  where u.id = any(p_user_ids)
    and (
      u.email in (select a.email from public.admin_users a)
      or exists (
        select 1 from public.user_roles ur
        where ur.user_id = u.id
          and ur.role in ('coach', 'content_editor', 'judge')
      )
    )
$$;

revoke all on function public.public_role_badges(uuid[]) from public;
grant execute on function public.public_role_badges(uuid[]) to anon, authenticated;

-- Rollback: drop function public.public_role_badges(uuid[]);
