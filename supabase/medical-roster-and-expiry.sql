-- B4 medical roster RPC + B3 expiry notifier (2026-07-16).
-- Applied to prod via MCP migrations `medical_roster_rpc(_bool_fix)` and
-- `medical_expiry_notifier`.

-- B4: league-manager/admin per-player medical summary (status/expiry only — never the
-- file). Gated inside the function since a league_manager can't read medical rows via
-- RLS. Ordered problems-first.
create or replace function public.medical_roster()
returns table (
  player_id uuid, first_name text, last_name text,
  team_id uuid, team_name text,
  has_valid boolean, valid_until date, latest_status text
) language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_league_manager()) then
    raise exception 'not authorized';
  end if;
  return query
    select p.id, p.first_name, p.last_name, p.team_id, t.name as team_name,
           coalesce(v.has_row, false) as has_valid,
           v.expires_at as valid_until,
           l.status as latest_status
    from public.players p
    left join public.teams t on t.id = p.team_id
    left join lateral (
      select true as has_row, m.expires_at
      from public.medical_certificates m
      where m.player_id = p.id and m.status = 'approved'
        and (m.expires_at is null or m.expires_at >= current_date)
      order by m.expires_at desc nulls last
      limit 1
    ) v on true
    left join lateral (
      select m.status
      from public.medical_certificates m
      where m.player_id = p.id
      order by m.created_at desc
      limit 1
    ) l on true
    order by coalesce(v.has_row, false) asc, t.name nulls last, p.last_name, p.first_name;
end;
$$;
revoke all on function public.medical_roster() from public, anon;
grant execute on function public.medical_roster() to authenticated;

-- B3: notify a linked player at 30 and 7 days before their approved medical expires.
-- A row insert also fires web push via the existing trg_notify_push.
create or replace function public.notify_expiring_medical()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select pr.id as profile_id, mc.player_id, mc.expires_at,
           (mc.expires_at - current_date) as days_left
    from public.medical_certificates mc
    join public.profiles pr on pr.player_id = mc.player_id
    where mc.status = 'approved'
      and mc.expires_at in (current_date + 30, current_date + 7)
  loop
    perform public.create_notification(
      r.profile_id, 'medical_expiring', null, 'player', r.player_id::text,
      jsonb_build_object('expires_at', r.expires_at, 'days_left', r.days_left)
    );
  end loop;
end;
$$;
revoke all on function public.notify_expiring_medical() from public, anon, authenticated;
grant execute on function public.notify_expiring_medical() to service_role;

do $$ begin perform cron.unschedule('medical-expiry-notify'); exception when others then null; end $$;
select cron.schedule('medical-expiry-notify', '0 8 * * *', $$select public.notify_expiring_medical();$$);
