-- Daily 19:00 nudge listing everything still waiting on a coach, with an email
-- fallback for coaches who have no device registered.
--
-- Applied as migrations `coach_open_items_daily_digest` and
-- `coach_digest_carry_items_for_email`; pulled back out of the deployed prosrc rather
-- than hand-written, because this directory has drifted from production before.
--
-- Every queue notified once, when the item arrived, and never again. A medical
-- certificate sat unapproved for 14 days after its coach had opened and READ that
-- notification, and the player could not register for a game the whole time.
--
-- The notification carries an `items` array as well as the counts: the bell and the push
-- only need the one-line summary, but the email renders a row per waiting item with a
-- link to that player, and building it in send-push would otherwise cost a second trip
-- to the database. Capped at 15 rows; the email says "ועוד N" beyond that.
--
-- The hour is checked in Asia/Jerusalem instead of being baked into the cron expression,
-- so 19:00 stays 19:00 across the DST change. Same approach as run_game_reminders().
--   select cron.schedule('coach-open-items', '0 * * * *',
--                        $$select public.coach_open_items_digest();$$);
-- Pass true to force a run; the one-per-coach-per-day guard still applies.
--
-- he_count_label exists because Hebrew does not pluralise like English -- the first cut
-- of this shipped "1 אישורים רפואיים", which is wrong.

CREATE OR REPLACE FUNCTION public.he_count_label(p_n integer, p_one text, p_many text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case when p_n = 1 then p_one else p_n || ' ' || p_many end
$function$


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
  v_parts text[]; v_tab text; v_items jsonb;
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

    if exists (select 1 from public.notifications n
                where n.user_id = c.user_id and n.type = 'coach_open_items'
                  and (n.created_at at time zone 'Asia/Jerusalem')::date = v_today)
    then continue; end if;

    -- one row per waiting item, oldest first, capped so a long backlog cannot bloat
    -- the payload; the email says "ועוד N" when it is truncated.
    select coalesce(jsonb_agg(to_jsonb(i) order by i.since), '[]'::jsonb) into v_items
      from (
        select 'medical' as queue, p.id as player_id,
               btrim(p.first_name||' '||p.last_name) as name,
               mc.created_at::date as since, (v_today - mc.created_at::date) as days
          from public.medical_certificates mc
          join public.players p on p.id = mc.player_id
         where mc.status='pending'
           and (p.team_id = any(c.teams)
                or exists (select 1 from public.player_teams pt
                            where pt.player_id=p.id and pt.team_id = any(c.teams)))
        union all
        select 'unavailability', p.id, btrim(p.first_name||' '||p.last_name),
               pu.created_at::date, (v_today - pu.created_at::date)
          from public.player_unavailability pu
          join public.players p on p.id = pu.player_id
         where pu.status='pending'
           and (p.team_id = any(c.teams)
                or exists (select 1 from public.player_teams pt
                            where pt.player_id=p.id and pt.team_id = any(c.teams)))
        union all
        select 'claim', p.id, btrim(p.first_name||' '||p.last_name),
               pc.created_at::date, (v_today - pc.created_at::date)
          from public.player_claims pc
          join public.players p on p.id = pc.player_id
         where pc.status='pending'
           and (p.team_id = any(c.teams)
                or exists (select 1 from public.player_teams pt
                            where pt.player_id=p.id and pt.team_id = any(c.teams)))
        union all
        select 'submission', null::uuid, btrim(ps.first_name||' '||ps.last_name),
               ps.created_at::date, (v_today - ps.created_at::date)
          from public.player_submissions ps
         where ps.status='pending' and ps.team_id = any(c.teams)
        union all
        select 'join', p.id, btrim(p.first_name||' '||p.last_name),
               tj.created_at::date, (v_today - tj.created_at::date)
          from public.team_join_requests tj
          join public.players p on p.id = tj.player_id
         where tj.status='pending' and tj.team_id = any(c.teams)
        order by since
        limit 15
      ) i;

    select min((x->>'since')::date) into v_oldest
      from jsonb_array_elements(v_items) x;
    v_days := greatest(v_today - coalesce(v_oldest, v_today), 0);

    v_parts := array[]::text[];
    if v_med    > 0 then v_parts := v_parts || public.he_count_label(v_med,    'אישור רפואי אחד',      'אישורים רפואיים'); end if;
    if v_unav   > 0 then v_parts := v_parts || public.he_count_label(v_unav,   'בקשת היעדרות אחת',     'בקשות היעדרות'); end if;
    if v_claims > 0 then v_parts := v_parts || public.he_count_label(v_claims, 'בקשת שיוך לשחקן אחת',  'בקשות שיוך לשחקן'); end if;
    if v_subs   > 0 then v_parts := v_parts || public.he_count_label(v_subs,   'כרטיס שחקן חדש אחד',   'כרטיסי שחקן חדשים'); end if;
    if v_joins  > 0 then v_parts := v_parts || public.he_count_label(v_joins,  'בקשת הצטרפות אחת',     'בקשות הצטרפות לקבוצה'); end if;

    v_tab := case when (v_med + v_claims + v_subs + v_joins) > 0 then 'claims' else 'unavailability' end;

    perform public.create_notification(
      c.user_id, 'coach_open_items', null, 'admin', v_tab,
      jsonb_build_object(
        'total', v_total, 'medical', v_med, 'unavailability', v_unav,
        'claims', v_claims, 'submissions', v_subs, 'joins', v_joins,
        'oldest_days', v_days, 'tab', v_tab,
        'team_name', (select t.name from public.teams t where t.id = c.teams[1]),
        'summary', array_to_string(v_parts, ', '),
        'items', v_items));
    v_sent := v_sent + 1;
  end loop;

  return v_sent;
end;
$function$
;

revoke execute on function public.coach_open_items_digest(boolean) from anon, authenticated, public;
