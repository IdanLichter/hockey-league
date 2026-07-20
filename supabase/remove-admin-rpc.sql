-- remove-admin-rpc.sql
-- Applied to production 2026-07-20 via MCP as migration `remove_admin_rpc`.
--
-- FIXES: removing an admin from the מנהלים tab silently did nothing.
--
-- admin-users-lockdown.sql locked SELECT to the caller's own row and reasoned that
-- "the UPDATE/DELETE policies still work because that subquery returns the caller's
-- own admin row under this policy". That is true of the POLICY EXPRESSION, but it
-- misses the other half: Postgres also applies SELECT policies to an UPDATE/DELETE
-- whose WHERE clause reads a table column. `delete from admin_users where id = $1`
-- reads `id`, so the target row must be SELECT-visible — and every admin except the
-- caller is hidden. Result: the delete matched 0 rows and returned NO error, so the
-- client's `if (error) throw` saw success and the admin stayed put. The one row that
-- IS visible (your own) is precisely the one the UI disables.
--
-- Fix mirrors list_admins(): a SECURITY DEFINER function owned by `postgres`
-- (BYPASSRLS), so the delete never goes through the own-row policy. Do NOT "fix"
-- this by loosening the SELECT policy — an is_admin()/self-select in the
-- admin_users SELECT policy infinite-recursions the admin console.
--
-- Guards: admin only; not yourself. Blocking self-removal also makes lockout
-- impossible — the caller always survives their own call, so the table can never
-- reach 0 admins.

create or replace function public.remove_admin(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;

  select email into v_email from public.admin_users where id = p_id;
  if v_email is null then raise exception 'admin not found'; end if;
  if lower(v_email) = lower(auth.jwt() ->> 'email') then
    raise exception 'cannot remove yourself';
  end if;

  delete from public.admin_users where id = p_id;
end;
$$;
revoke all on function public.remove_admin(uuid) from public, anon;
grant execute on function public.remove_admin(uuid) to authenticated;
