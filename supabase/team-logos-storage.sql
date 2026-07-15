-- team-logos-storage.sql  (Crest storage foundation)
-- A public Storage bucket for team crests. `teams.logo_url` stays the single
-- source of truth for display (TeamLogo renders a plain <img src>); this bucket
-- is where coach/admin-uploaded crests physically live, and the 7 legacy
-- static /logos/*.png are migrated into it (see migrate-crests-to-bucket.md).
--
-- Auth model mirrors user-created-teams.sql: `teams` RLS is admin-write-only, so
-- logo_url is written through the set_team_logo() SECURITY DEFINER RPC. The
-- bucket is public-READ; WRITE is scoped to the team's coach, an admin, or the
-- creator of a still-pending team (so a new-team application can carry a crest).
-- Folder layout inside the bucket: <team_id>/<file>.

-- ============ BUCKET ============
insert into storage.buckets (id, name, public)
values ('team-logos', 'team-logos', true)
on conflict (id) do update set public = true;

-- ============ HELPERS ============
-- Safe uuid parse: a malformed upload path must DENY (return null), never throw
-- inside a policy predicate.
create or replace function public.try_uuid(t text)
returns uuid language sql immutable as $$
  select case
    when t ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then t::uuid else null end
$$;
grant execute on function public.try_uuid(text) to authenticated, anon;

-- Who may write crest files for a given team folder (folder name = team_id).
create or replace function public.can_write_team_logo(p_team uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_team is not null and (
    public.is_admin()
    or public.is_coach_of(p_team)
    or exists (
      select 1 from public.teams t
      where t.id = p_team
        and t.created_by = auth.uid()
        and t.status = 'pending'
    )
  )
$$;
revoke all on function public.can_write_team_logo(uuid) from public, anon;
grant execute on function public.can_write_team_logo(uuid) to authenticated;

-- ============ STORAGE RLS (storage.objects) ============
-- Public read; write only for admin / team-coach / pending-team creator.
create policy "team-logos public read" on storage.objects
  for select using (bucket_id = 'team-logos');

create policy "team-logos scoped insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'team-logos'
    and public.can_write_team_logo(public.try_uuid((storage.foldername(name))[1]))
  );

create policy "team-logos scoped update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'team-logos'
    and public.can_write_team_logo(public.try_uuid((storage.foldername(name))[1]))
  );

create policy "team-logos scoped delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'team-logos'
    and public.can_write_team_logo(public.try_uuid((storage.foldername(name))[1]))
  );

-- ============ WRITE RPC (teams is admin-write-only) ============
create or replace function public.set_team_logo(p_team_id uuid, p_url text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_write_team_logo(p_team_id) then
    raise exception 'not authorized';
  end if;
  update public.teams set logo_url = nullif(btrim(coalesce(p_url,'')), '')
   where id = p_team_id;
end;
$$;
revoke all on function public.set_team_logo(uuid, text) from public, anon;
grant execute on function public.set_team_logo(uuid, text) to authenticated;
