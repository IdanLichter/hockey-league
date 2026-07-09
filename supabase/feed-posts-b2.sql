-- ============================================================================
-- Stage B2 — feed posting rules  (applied to live DB as migration
-- `stage_b2_posting_rules`, 2026-07-09). Builds on accounts-schema.sql (B0).
--
-- Rule: any signed-in user may post text; REGULAR users (no role, non-admin)
-- are limited to 1 post / rolling 24h. Roled users (player/coach/content_editor/
-- judge) and admins are exempt. Guests (anon) stay read-only.
-- ============================================================================

-- 1) Replace the role-gated insert policy: any authenticated user may create
--    their own post. (can_post() is no longer used — dropped below.)
drop policy if exists "Can-post users insert own" on public.posts;
create policy "Authenticated insert own posts" on public.posts
  for insert to authenticated
  with check (author_id = auth.uid());

-- 2) Rate limit (1 post / 24h) for regular users, enforced by a BEFORE trigger.
create or replace function public.enforce_post_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare recent int;
begin
  if public.is_admin() or exists (select 1 from public.user_roles where user_id = new.author_id) then
    return new; -- admins + roled users are exempt
  end if;
  select count(*) into recent from public.posts
    where author_id = new.author_id and deleted_at is null
      and created_at > now() - interval '24 hours';
  if recent >= 1 then
    raise exception 'post_rate_limit' using hint = 'regular users may post once per day';
  end if;
  return new;
end; $$;

create trigger posts_rate_limit
  before insert on public.posts
  for each row execute function public.enforce_post_rate_limit();

revoke execute on function public.enforce_post_rate_limit() from public, anon, authenticated;

-- 3) can_post() is now unused → drop it (also clears its advisor warnings).
drop function if exists public.can_post();

-- ---------- rollback ----------
-- drop trigger if exists posts_rate_limit on public.posts;
-- drop function if exists public.enforce_post_rate_limit();
-- drop policy if exists "Authenticated insert own posts" on public.posts;
-- (to fully restore B0, recreate can_post() + the "Can-post users insert own" policy
--  from accounts-schema.sql)
