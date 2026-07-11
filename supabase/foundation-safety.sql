-- ============================================================================
-- Foundation safety hardening (2026-07-11).
-- ============================================================================

-- 1) cluster_suggestions: close the anonymous INSERT hole. The old policy
--    allowed `suggested_by IS NULL`, i.e. any logged-out visitor could write
--    the only no-login write path in the schema. Now require a signed-in user
--    who owns the row. (Public SELECT + admin DELETE policies are unchanged.)
drop policy if exists "Anyone can suggest" on public.cluster_suggestions;
create policy "Members suggest names" on public.cluster_suggestions
  for insert to authenticated
  with check (suggested_by = auth.uid());

-- Length caps as an abuse guard. NOT VALID: enforced on all new writes, but
-- skips re-validating the 19 legacy rows (which hold real names anyway).
alter table public.cluster_suggestions
  add constraint cluster_suggestions_first_len check (char_length(first_name) between 1 and 80) not valid;
alter table public.cluster_suggestions
  add constraint cluster_suggestions_last_len  check (char_length(last_name)  between 1 and 80) not valid;

-- 2) player_claims: one-pending-per-user is already enforced by the partial
--    unique index `player_claims_one_pending_per_user`. The remaining gap is
--    claiming a player that's ALREADY linked to a profile — block that.
create or replace function public.guard_claim_player_available() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.profiles where player_id = NEW.player_id) then
    raise exception 'player_already_linked';
  end if;
  return NEW;
end; $$;
revoke execute on function public.guard_claim_player_available() from public, anon, authenticated;
drop trigger if exists trg_guard_claim_player on public.player_claims;
create trigger trg_guard_claim_player before insert on public.player_claims
  for each row execute function public.guard_claim_player_available();
