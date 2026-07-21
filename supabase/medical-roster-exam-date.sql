-- League-manager "מעקב רפואי" tab: surface the APPROVED certificate's exam date and
-- its file, so the roster can show a real date column and only let a manager open the
-- file when the player actually has an approved certificate.
--
-- Additive & backward-compatible: keeps the existing return columns (incl.
-- latest_file_path) and appends exam_date + approved_file_path, so any other consumer
-- of the RPC keeps working. Signature changes → drop + recreate.

drop function if exists public.medical_roster();

create function public.medical_roster()
returns table(
  player_id uuid, first_name text, last_name text, team_id uuid, team_name text,
  has_valid boolean, valid_until date, latest_status text, latest_file_path text,
  exam_date date, approved_file_path text
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not (public.is_admin() or public.is_league_manager()) then
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
    -- currently valid (approved and not expired) → drives has_valid + valid_until
    left join lateral (
      select true as has_row, m.expires_at
      from public.medical_certificates m
      where m.player_id = p.id and m.status = 'approved'
        and (m.expires_at is null or m.expires_at >= current_date)
      order by m.expires_at desc nulls last
      limit 1
    ) v on true
    -- latest certificate of any status → drives the status pill + latest_file_path
    left join lateral (
      select m.status, m.file_path
      from public.medical_certificates m
      where m.player_id = p.id
      order by m.created_at desc
      limit 1
    ) l on true
    -- latest APPROVED certificate (may be expired) → the exam date + the file the
    -- manager is allowed to view
    left join lateral (
      select m.exam_date, m.file_path
      from public.medical_certificates m
      where m.player_id = p.id and m.status = 'approved'
      order by m.created_at desc
      limit 1
    ) a on true
    order by coalesce(v.has_row, false) asc, t.name nulls last, p.last_name, p.first_name;
end;
$function$;

revoke all on function public.medical_roster() from public, anon;
grant execute on function public.medical_roster() to authenticated;
