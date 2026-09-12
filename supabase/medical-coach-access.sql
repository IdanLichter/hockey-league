-- Coach access to medical certificates.
--
-- Applied as migration `medical_roster_and_certs_for_coaches`. Pulled back out of the
-- deployed prosrc, not hand-written -- the rest of this directory has drifted from
-- production before, so treat pg_get_functiondef as the source of truth.
--
-- The league's simulation run reported "צפייה של בדיקה רפואית לא עובדת במובייל
-- עבור מאמנים". Two causes: medical_roster() raised outright for a coach, so there was
-- no surface to browse a squad's certificates from; and player_medical_certs() resolved
-- a coach through players.team_id alone, refusing the coach of a youth squad for a
-- player whose primary card sits on the senior side.
--
-- medical_roster() now admits a coach and filters to his own players -- the filter has
-- to live inside the function because SECURITY DEFINER bypasses the table's RLS.
-- Verified: a real coach of גבעת עדה חלוצים sees 18 rows across 1 team; a league
-- manager still sees 97 across 7.

CREATE OR REPLACE FUNCTION public.medical_roster()
 RETURNS TABLE(player_id uuid, first_name text, last_name text, team_id uuid, team_name text, has_valid boolean, valid_until date, latest_status text, latest_file_path text, exam_date date, approved_file_path text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_all boolean;
begin
  v_all := coalesce(public.is_admin(), false) or coalesce(public.is_league_manager(), false);
  if not (v_all or coalesce(public.is_coach(), false)) then
    raise exception 'not authorized';
  end if;
  return query
    select p.id, p.first_name, p.last_name, p.team_id, t.name as team_name,
           coalesce(v.has_row, false) as has_valid,
           v.expires_at as valid_until,
           l.status as latest_status,
           l.file_path as latest_file_path,
           a.exam_date as exam_date,
           a.file_path as approved_file_path
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
      select m.status, m.file_path
      from public.medical_certificates m
      where m.player_id = p.id
      order by m.created_at desc
      limit 1
    ) l on true
    left join lateral (
      select m.exam_date, m.file_path
      from public.medical_certificates m
      where m.player_id = p.id and m.status = 'approved'
      order by m.created_at desc
      limit 1
    ) a on true
    -- a coach sees his own squad only; everyone entitled to the full roster sees all
    where v_all or public.is_coach_of_player(p.id)
    order by t.name nulls last, p.first_name, p.last_name;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.player_medical_certs(p_player uuid)
 RETURNS TABLE(id uuid, status text, exam_date date, expires_at date, file_path text, created_at timestamp with time zone, note text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (coalesce(public.is_admin(), false)
          or coalesce(public.is_league_manager(), false)
          or public.is_coach_of_player(p_player)) then
    raise exception 'not authorized';
  end if;
  return query
    select mc.id, mc.status, mc.exam_date, mc.expires_at, mc.file_path, mc.created_at, mc.note
    from public.medical_certificates mc
    where mc.player_id = p_player
    order by mc.created_at desc;
end;
$function$
;

revoke execute on function public.medical_roster() from anon;
revoke execute on function public.player_medical_certs(uuid) from anon;
