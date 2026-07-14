-- admin-delete-user.sql
-- Applied to production 2026-07-14 via MCP as migration `admin_delete_user`.
--
-- Admin-only permanent user deletion, exposed from the Roles tab. Deletes the auth
-- account (frees the email → the person must sign up again). profiles + user_roles
-- + posts + comments + likes + player_claims + player_submissions cascade via their
-- FKs. The linked players row (stats/history) is PRESERVED — only the profile link
-- goes. content_reports references auth.users with NO ACTION, so it is cleared first
-- or the delete would block. Guards: admin only, not self, not another admin.
-- Owner is postgres (SECURITY DEFINER) so it can delete from auth.users.

create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if p_user_id = auth.uid() then raise exception 'cannot delete yourself'; end if;
  if exists (
    select 1 from auth.users u
    join public.admin_users a on lower(a.email) = lower(u.email)
    where u.id = p_user_id
  ) then
    raise exception 'cannot delete an admin';
  end if;

  delete from public.content_reports where reporter_id = p_user_id;
  update public.content_reports set reviewed_by = null where reviewed_by = p_user_id;

  delete from auth.users where id = p_user_id;
end;
$$;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;
