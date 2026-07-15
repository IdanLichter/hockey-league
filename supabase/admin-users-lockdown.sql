-- admin-users-lockdown.sql
-- Hardening: admin_users SELECT was `auth.role() = 'authenticated'`, i.e. ANY
-- logged-in user could list every admin's email/name. Lock SELECT to the
-- caller's own row (which is all AuthContext.checkAdmin needs — it queries by
-- own email), and serve the full admin list to the admin console through an
-- is_admin()-gated RPC.
--
-- WHY THE RPC IS SAFE (no recursion): list_admins() is SECURITY DEFINER owned by
-- `postgres`, which has BYPASSRLS, so its `select * from admin_users` skips the
-- own-row policy entirely — it never re-enters the policy. This is the reason we
-- do NOT put is_admin()/a self-select in the SELECT policy itself (that path
-- infinite-recursions the admin console — see the admin_users recursion gotcha).
--
-- Applied to prod as two migrations, sequenced so the deployed frontend uses the
-- RPC BEFORE the SELECT policy tightens (zero admin-console downtime):
--   1. admin_users_list_rpc   — this RPC (deployed with the getAdminUsers change)
--   2. admin_users_own_row_select — the policy swap (after the deploy went live)

-- 1) The full-list RPC (already applied)
create or replace function public.list_admins()
returns setof public.admin_users
language sql stable security definer set search_path to 'public'
as $$
  select * from public.admin_users where public.is_admin() order by created_at
$$;
revoke execute on function public.list_admins() from public, anon;
grant execute on function public.list_admins() to authenticated;

-- 2) Own-row SELECT policy (replaces the "any authenticated user" policy).
-- checkAdmin (.eq('email', own_email)) still returns the caller's row; the
-- UPDATE/DELETE policies (email IN (select email from admin_users)) still work
-- because that subquery returns the caller's own admin row under this policy.
drop policy if exists "Auth users check admin status" on public.admin_users;
create policy "Read own admin row" on public.admin_users
  for select using ((auth.jwt() ->> 'email') = email);
