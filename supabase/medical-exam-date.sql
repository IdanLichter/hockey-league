-- Medical exam date + 1-year expiry (2026-07-16). Applied to prod via MCP migration
-- `medical_exam_date_and_expiry`. Builds on medical-certificates.sql.
--
-- On approval the coach now enters the exam date (when the physical was performed);
-- the cert is valid for one year from that date. expires_at (previously unused) is
-- derived server-side. Legacy approved rows keep a null expires_at and are grandfathered
-- as valid by readers (see getApprovedMedicalPlayerIds).

alter table public.medical_certificates add column if not exists exam_date date;

drop function if exists public.review_medical_certificate(uuid, text);

create or replace function public.review_medical_certificate(p_id uuid, p_status text, p_exam_date date default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_team uuid;
begin
  if p_status not in ('approved','rejected') then raise exception 'bad status'; end if;
  select pl.team_id into v_team
    from public.medical_certificates mc join public.players pl on pl.id = mc.player_id
   where mc.id = p_id;
  if v_team is null then raise exception 'not found'; end if;
  if not (public.is_admin() or public.is_coach_of(v_team)) then raise exception 'not authorized'; end if;
  if p_status = 'approved' then
    if p_exam_date is null then raise exception 'exam date required'; end if;
    if p_exam_date > current_date then raise exception 'exam date in future'; end if;
    update public.medical_certificates
       set status = 'approved', exam_date = p_exam_date,
           expires_at = p_exam_date + interval '1 year',
           reviewed_at = now(), reviewed_by = auth.uid()
     where id = p_id;
  else
    update public.medical_certificates
       set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid()
     where id = p_id;
  end if;
end;
$$;
revoke all on function public.review_medical_certificate(uuid, text, date) from public, anon;
grant execute on function public.review_medical_certificate(uuid, text, date) to authenticated;
