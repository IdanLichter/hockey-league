-- Daily 19:00 nudge listing everything still waiting on a coach.
--
-- Applied as migration `coach_open_items_daily_digest`; pulled back out of the deployed
-- prosrc rather than hand-written, because this directory has drifted from production before.
--
-- Every queue notified once, when the item arrived, and never again. A medical certificate
-- sat unapproved for 14 days after its coach had opened and READ that notification, and the
-- player could not register for a game the whole time -- the server refuses anyone without a
-- valid medical. One message is too easy to miss; this repeats until the queue is empty.
--
-- Covers: pending medicals, absence reports, player-claim requests, new player cards and
-- team-join requests, scoped to the coach's squad by primary card OR player_teams.
--
-- The hour is checked in Asia/Jerusalem instead of being baked into the cron expression, so
-- 19:00 stays 19:00 across the DST change. Same approach as run_game_reminders().
--   select cron.schedule('coach-open-items', '10 * * * *',
--                        $$select public.coach_open_items_digest();$$);
-- Pass true to force a run outside 19:00; the one-per-coach-per-day guard still applies.

CREATE OR REPLACE FUNCTION public.coach_open_items_digest(p_force boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sent  int := 0;
  c       record;
  v_med int; v_unav int; v_claims int; v_subs int; v_joins int; v_total int;
  v_oldest date; v_days int;
  v_parts text[]; v_tab text;
  v_today date := (now() at time zone 'Asia/Jerusalem')::date;
begin
  if not p_force
     and extract(hour from (now() at time zone 'Asia/Jerusalem'))::int <> 19 then
    return 0;
  end if;

  for c in
    select ur.user_id, array_agg(distinct ur.team_id) as teams
      from public.user_roles ur
     where ur.role = 'coach' and ur.team_id is not null
     group by ur.user_id
  loop
    -- "his players" = the squad by primary card OR by any player_teams membership,
    -- the same reach every other coach-scoped check uses.
    select count(*) into v_med from public.medical_certificates mc
     where mc.status = 'pending'
       and exists (select 1 from public.players p where p.id = mc.player_id
                    and (p.team_id = any(c.teams)
                         or exists (select 1 from public.player_teams pt
                                     where pt.player_id = p.id and pt.team_id = any(c.teams))));

    select count(*) into v_unav from public.player_unavailability pu
     where pu.status = 'pending'
       and exists (select 1 from public.players p where p.id = pu.player_id
                    and (p.team_id = any(c.teams)
                         or exists (select 1 from public.player_teams pt
                                     where pt.player_id = p.id and pt.team_id = any(c.teams))));

    select count(*) into v_claims from public.player_claims pc
     where pc.status = 'pending'
       and exists (select 1 from public.players p where p.id = pc.player_id
                    and (p.team_id = any(c.teams)
                         or exists (select 1 from public.player_teams pt
                                     where pt.player_id = p.id and pt.team_id = any(c.teams))));

    select count(*) into v_subs from public.player_submissions ps
     where ps.status = 'pending' and ps.team_id = any(c.teams);

    select count(*) into v_joins from public.team_join_requests tj
     where tj.status = 'pending' and tj.team_id = any(c.teams);

    v_total := v_med + v_unav + v_claims + v_subs + v_joins;
    if v_total = 0 then continue; end if;

    -- one per coach per day, so a manual run cannot double up on the scheduled one
    if exists (select 1 from public.notifications n
                where n.user_id = c.user_id and n.type = 'coach_open_items'
                  and (n.created_at at time zone 'Asia/Jerusalem')::date = v_today)
    then continue; end if;

    select min(d) into v_oldest from (
      select min(mc.created_at::date) d from public.medical_certificates mc
        where mc.status='pending' and exists (select 1 from public.players p
              where p.id=mc.player_id and (p.team_id = any(c.teams)
              or exists (select 1 from public.player_teams pt where pt.player_id=p.id and pt.team_id = any(c.teams))))
      union all
      select min(pu.created_at::date) from public.player_unavailability pu
        where pu.status='pending' and exists (select 1 from public.players p
              where p.id=pu.player_id and (p.team_id = any(c.teams)
              or exists (select 1 from public.player_teams pt where pt.player_id=p.id and pt.team_id = any(c.teams))))
      union all
      select min(ps.created_at::date) from public.player_submissions ps
        where ps.status='pending' and ps.team_id = any(c.teams)
      union all
      select min(tj.created_at::date) from public.team_join_requests tj
        where tj.status='pending' and tj.team_id = any(c.teams)
    ) x;
    v_days := greatest(v_today - v_oldest, 0);

    v_parts := array[]::text[];
    if v_med    > 0 then v_parts := v_parts || (v_med    || ' אישורים רפואיים'); end if;
    if v_unav   > 0 then v_parts := v_parts || (v_unav   || ' בקשות היעדרות');   end if;
    if v_claims > 0 then v_parts := v_parts || (v_claims || ' בקשות שיוך לשחקן'); end if;
    if v_subs   > 0 then v_parts := v_parts || (v_subs   || ' כרטיסי שחקן חדשים'); end if;
    if v_joins  > 0 then v_parts := v_parts || (v_joins  || ' בקשות הצטרפות לקבוצה'); end if;

    -- four of the five queues live in the claims tab; only absences sit elsewhere
    v_tab := case when (v_med + v_claims + v_subs + v_joins) > 0 then 'claims' else 'unavailability' end;

    perform public.create_notification(
      c.user_id, 'coach_open_items', null, 'admin', v_tab,
      jsonb_build_object(
        'total', v_total, 'medical', v_med, 'unavailability', v_unav,
        'claims', v_claims, 'submissions', v_subs, 'joins', v_joins,
        'oldest_days', v_days, 'tab', v_tab,
        'summary', array_to_string(v_parts, ', ')));
    v_sent := v_sent + 1;
  end loop;

  return v_sent;
end;
$function$
;

revoke execute on function public.coach_open_items_digest(boolean) from anon, authenticated, public;
