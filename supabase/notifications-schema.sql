-- ============================================================================
-- Notifications (in-app "bell").
--
-- One row per recipient. Written ONLY server-side by SECURITY DEFINER triggers,
-- so a client can never forge a notification for another user: there is no
-- INSERT policy for anon/authenticated. Clients may read / mark-read / dismiss
-- their OWN rows.
--
-- Every trigger function is exception-wrapped: a failure to record a
-- notification must NEVER roll back the source operation (a like, a comment,
-- a claim review, a game completion...). Notifications are best-effort.
--
-- DMs deliberately do NOT create notifications here — unread DMs are surfaced
-- on the chat icon's own badge (see direct-messages-schema.sql), so the bell
-- and the chat badge never double-count the same event.
-- ============================================================================

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,   -- recipient
  type        text not null,            -- post_like | post_comment | claim_approved | claim_rejected | role_granted | claim_request | content_report | game_result
  actor_id    uuid references auth.users(id) on delete set null,           -- who caused it (null = system)
  entity_type text,                     -- post | player | claim | role | game | ...
  entity_id   text,                     -- uuid-as-text (kept flexible; entities live in different tables)
  data        jsonb not null default '{}'::jsonb,   -- denormalized preview so rendering needs zero joins
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx  on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

-- Read / mark-read / dismiss your OWN rows only. No INSERT policy on purpose.
drop policy if exists "read own notifications"   on public.notifications;
drop policy if exists "update own notifications" on public.notifications;
drop policy if exists "delete own notifications" on public.notifications;
create policy "read own notifications"   on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "update own notifications" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own notifications" on public.notifications for delete to authenticated using (user_id = auth.uid());

-- Live badge updates (resilient: never abort the migration on a publication quirk).
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when others then null; end $$;

-- ----------------------------------------------------------------------------
-- Shared insert helper. SECURITY DEFINER + revoked from clients so it can only
-- be reached from the trigger functions below, never via PostgREST RPC.
-- Skips self-notification (you liking/commenting on your own post).
-- ----------------------------------------------------------------------------
create or replace function public.create_notification(
  p_user_id uuid, p_type text, p_actor_id uuid,
  p_entity_type text, p_entity_id text, p_data jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user_id is null or p_user_id = p_actor_id then
    return;
  end if;
  insert into public.notifications(user_id, type, actor_id, entity_type, entity_id, data)
  values (p_user_id, p_type, p_actor_id, p_entity_type, p_entity_id, coalesce(p_data, '{}'::jsonb));
exception when others then
  return;   -- best-effort: never propagate
end; $$;
revoke all on function public.create_notification(uuid,text,uuid,text,text,jsonb) from public, anon, authenticated;

-- ---- like on your post ------------------------------------------------------
create or replace function public.notify_on_post_like() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_author uuid; v_body text;
begin
  select author_id, body into v_author, v_body from public.posts where id = NEW.post_id and deleted_at is null;
  perform public.create_notification(
    v_author, 'post_like', NEW.user_id, 'post', NEW.post_id::text,
    jsonb_build_object('preview', left(coalesce(v_body, ''), 80)));
  return null;
exception when others then return null;
end; $$;
drop trigger if exists trg_notify_post_like on public.post_likes;
create trigger trg_notify_post_like after insert on public.post_likes
  for each row execute function public.notify_on_post_like();

-- ---- comment on your post ---------------------------------------------------
create or replace function public.notify_on_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_author uuid;
begin
  select author_id into v_author from public.posts where id = NEW.post_id and deleted_at is null;
  perform public.create_notification(
    v_author, 'post_comment', NEW.author_id, 'post', NEW.post_id::text,
    jsonb_build_object('preview', left(coalesce(NEW.body, ''), 80)));
  return null;
exception when others then return null;
end; $$;
drop trigger if exists trg_notify_comment on public.comments;
create trigger trg_notify_comment after insert on public.comments
  for each row execute function public.notify_on_comment();

-- ---- your player-claim was approved / rejected ------------------------------
create or replace function public.notify_on_claim_review() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pname text;
begin
  if NEW.status is distinct from OLD.status and NEW.status in ('approved', 'rejected') then
    select coalesce(first_name, '') || ' ' || coalesce(last_name, '') into v_pname from public.players where id = NEW.player_id;
    perform public.create_notification(
      NEW.profile_id,
      case when NEW.status = 'approved' then 'claim_approved' else 'claim_rejected' end,
      NEW.reviewed_by, 'player', NEW.player_id::text,
      jsonb_build_object('player_name', trim(coalesce(v_pname, ''))));
  end if;
  return null;
exception when others then return null;
end; $$;
drop trigger if exists trg_notify_claim_review on public.player_claims;
create trigger trg_notify_claim_review after update on public.player_claims
  for each row execute function public.notify_on_claim_review();

-- ---- you were granted a role ------------------------------------------------
create or replace function public.notify_on_role_grant() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.create_notification(
    NEW.user_id, 'role_granted', null, 'role', NEW.role,
    jsonb_build_object('role', NEW.role, 'team_id', NEW.team_id));
  return null;
exception when others then return null;
end; $$;
drop trigger if exists trg_notify_role_grant on public.user_roles;
create trigger trg_notify_role_grant after insert on public.user_roles
  for each row execute function public.notify_on_role_grant();

-- ---- admins: a new claim request came in ------------------------------------
create or replace function public.notify_admins_new_claim() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pname text; v_cname text;
begin
  select coalesce(first_name, '') || ' ' || coalesce(last_name, '') into v_pname from public.players where id = NEW.player_id;
  select display_name into v_cname from public.profiles where id = NEW.profile_id;
  insert into public.notifications(user_id, type, actor_id, entity_type, entity_id, data)
  select au.id, 'claim_request', NEW.profile_id, 'claim', NEW.id::text,
         jsonb_build_object('player_name', trim(coalesce(v_pname, '')), 'claimant', coalesce(v_cname, ''))
  from public.admin_users a join auth.users au on au.email = a.email
  where au.id <> NEW.profile_id;
  return null;
exception when others then return null;
end; $$;
drop trigger if exists trg_notify_new_claim on public.player_claims;
create trigger trg_notify_new_claim after insert on public.player_claims
  for each row execute function public.notify_admins_new_claim();

-- ---- admins: content was reported -------------------------------------------
create or replace function public.notify_admins_new_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications(user_id, type, actor_id, entity_type, entity_id, data)
  select au.id, 'content_report', NEW.reporter_id, NEW.target_type, NEW.target_id::text,
         jsonb_build_object('reason', coalesce(NEW.reason, ''))
  from public.admin_users a join auth.users au on au.email = a.email
  where au.id <> NEW.reporter_id;
  return null;
exception when others then return null;
end; $$;
drop trigger if exists trg_notify_new_report on public.content_reports;
create trigger trg_notify_new_report after insert on public.content_reports
  for each row execute function public.notify_admins_new_report();

-- ---- a game you played in was completed -------------------------------------
-- Fires on the status -> 'completed' transition (both the judge RPC and the
-- admin editor do this). game_stats are already written at that point, so we
-- fan out to every profile linked to a player in the box score.
create or replace function public.notify_on_game_completed() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_home text; v_away text;
begin
  if NEW.status = 'completed' and OLD.status is distinct from NEW.status then
    select name into v_home from public.teams where id = NEW.home_team_id;
    select name into v_away from public.teams where id = NEW.away_team_id;
    insert into public.notifications(user_id, type, actor_id, entity_type, entity_id, data)
    select distinct pr.id, 'game_result', null, 'game', NEW.id::text,
           jsonb_build_object('home_team', coalesce(v_home, ''), 'away_team', coalesce(v_away, ''),
                              'home_score', NEW.home_score, 'away_score', NEW.away_score)
    from public.game_stats gs
    join public.profiles pr on pr.player_id = gs.player_id
    where gs.game_id = NEW.id;
  end if;
  return null;
exception when others then return null;
end; $$;
drop trigger if exists trg_notify_game_completed on public.games;
create trigger trg_notify_game_completed after update on public.games
  for each row execute function public.notify_on_game_completed();

-- Trigger functions are invoked by the trigger system, not via RPC, so their
-- EXECUTE grant is irrelevant to firing. Revoke the PUBLIC default so they don't
-- surface as anon/authenticated-callable in the security advisor.
revoke execute on function public.notify_on_post_like()      from public, anon, authenticated;
revoke execute on function public.notify_on_comment()        from public, anon, authenticated;
revoke execute on function public.notify_on_claim_review()   from public, anon, authenticated;
revoke execute on function public.notify_on_role_grant()     from public, anon, authenticated;
revoke execute on function public.notify_admins_new_claim()  from public, anon, authenticated;
revoke execute on function public.notify_admins_new_report() from public, anon, authenticated;
revoke execute on function public.notify_on_game_completed() from public, anon, authenticated;
