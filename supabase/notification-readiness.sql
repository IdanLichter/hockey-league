-- notification-readiness.sql (P0 — 2026-08-02)
-- Applied to production via MCP as migration `notification_readiness`.
--
-- Who can actually be reached by the scheduled reminders (sheet rows 1, 9, 10, 12, 18)?
-- A reminder is only as good as its delivery, and today the funnel is steep: 98 players,
-- 39 with an account, 11 with push. This RPC turns that into a chase-list — one row per
-- player, ordered worst-first — so the gaps can be closed before the test rather than
-- discovered during it.
--
-- Admin / league-manager only: it exposes who has and hasn't signed up.

create or replace function public.notification_readiness()
returns table (
  player_id   uuid,
  first_name  text,
  last_name   text,
  team_id     uuid,
  team_name   text,
  has_account boolean,
  has_push    boolean
) language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_league_manager()) then
    raise exception 'not authorized';
  end if;
  return query
    select p.id, p.first_name, p.last_name, p.team_id, t.name as team_name,
           (pr.id is not null)          as has_account,
           coalesce(ps.n, 0) > 0        as has_push
    from public.players p
    left join public.teams t on t.id = p.team_id
    -- limit 1: a player should have at most one linked profile, but the join must not
    -- be able to duplicate his row if that ever stops being true
    left join lateral (
      select pr2.id from public.profiles pr2 where pr2.player_id = p.id limit 1
    ) pr on true
    left join lateral (
      select count(*) as n from public.push_subscriptions s where s.user_id = pr.id
    ) ps on true
    -- worst first: no account, then account-but-no-push, then fully reachable
    order by (pr.id is not null), (coalesce(ps.n, 0) > 0),
             t.name nulls last, p.last_name, p.first_name;
end;
$$;
revoke all on function public.notification_readiness() from public, anon;
grant execute on function public.notification_readiness() to authenticated;
