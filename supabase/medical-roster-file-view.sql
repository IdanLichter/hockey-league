-- Let league managers (in addition to admins) view the actual medical document
-- from the "מעקב רפואי" tab, so they can inspect a player's certificate themselves.
-- Coaches already could (team-scoped). Two changes:
--   1. Widen the private-bucket storage read policy to include league managers.
--   2. Surface the latest certificate's file_path from the medical_roster RPC so the
--      admin/LM UI can open a short-lived signed URL to it.

-- 1. Storage read access ---------------------------------------------------------
alter policy "medical read self/coach/admin" on storage.objects
  using (
    (bucket_id = 'medical'::text) and (
      ((storage.foldername(name))[1] = (my_player_id())::text)
      or is_admin()
      or is_league_manager()
      or (exists (
        select 1 from players pl
        where (pl.id)::text = (storage.foldername(objects.name))[1]
          and is_coach_of(pl.team_id)
      ))
    )
  );

-- 2. Roster RPC now returns the latest certificate's file path -------------------
-- (return signature changes, so drop + recreate rather than replace)
drop function if exists public.medical_roster();

create function public.medical_roster()
returns table(
  player_id uuid, first_name text, last_name text, team_id uuid, team_name text,
  has_valid boolean, valid_until date, latest_status text, latest_file_path text
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
           l.file_path as latest_file_path
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
    order by coalesce(v.has_row, false) asc, t.name nulls last, p.last_name, p.first_name;
end;
$function$;
