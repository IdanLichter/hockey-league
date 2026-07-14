-- medical-certificates.sql
-- Applied to production 2026-07-14 via MCP as migration `medical_certificates`.
--
-- #2 medical file submission. A linked player uploads a photo/PDF of their yearly
-- physical to a PRIVATE Storage bucket; the team coach (or admin) views it via a
-- short-lived signed URL and approves/rejects. Nothing here is ever public — files
-- are scoped to "<player_id>/<file>" and reachable only by the player, their coach,
-- and admins (via storage RLS), served through createSignedUrl.

-- ===== private Storage bucket =====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('medical', 'medical', false, 10485760,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

create policy "medical upload own" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'medical'
    and (storage.foldername(name))[1] = public.my_player_id()::text
  );
create policy "medical read self/coach/admin" on storage.objects
  for select to authenticated using (
    bucket_id = 'medical' and (
      (storage.foldername(name))[1] = public.my_player_id()::text
      or public.is_admin()
      or exists (select 1 from public.players pl
                 where pl.id::text = (storage.foldername(name))[1] and public.is_coach_of(pl.team_id))
    )
  );
create policy "medical delete own" on storage.objects
  for delete to authenticated using (
    bucket_id = 'medical'
    and (storage.foldername(name))[1] = public.my_player_id()::text
  );

-- ===== metadata table =====
create table if not exists public.medical_certificates (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.players(id) on delete cascade,
  file_path   text not null,
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  note        text,
  expires_at  date,
  uploaded_by uuid,
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid
);
create index if not exists medical_certificates_player_idx on public.medical_certificates(player_id);
create unique index if not exists medical_certificates_one_pending
  on public.medical_certificates(player_id) where status = 'pending';

alter table public.medical_certificates enable row level security;

create policy "read medical self/coach/admin" on public.medical_certificates
  for select using (
    player_id = public.my_player_id()
    or public.is_admin()
    or exists (select 1 from public.players pl
               where pl.id = medical_certificates.player_id and public.is_coach_of(pl.team_id))
  );
create policy "player inserts own medical" on public.medical_certificates
  for insert with check (player_id = public.my_player_id() and status = 'pending' and uploaded_by = auth.uid());
create policy "player deletes own pending medical" on public.medical_certificates
  for delete using ((player_id = public.my_player_id() and status = 'pending') or public.is_admin());

create or replace function public.review_medical_certificate(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_team uuid;
begin
  if p_status not in ('approved','rejected') then raise exception 'bad status'; end if;
  select pl.team_id into v_team
    from public.medical_certificates mc join public.players pl on pl.id = mc.player_id
   where mc.id = p_id;
  if v_team is null then raise exception 'not found'; end if;
  if not (public.is_admin() or public.is_coach_of(v_team)) then raise exception 'not authorized'; end if;
  update public.medical_certificates
     set status = p_status, reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_id;
end;
$$;
revoke all on function public.review_medical_certificate(uuid, text) from public, anon;
grant execute on function public.review_medical_certificate(uuid, text) to authenticated;
