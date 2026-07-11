-- ============================================================================
-- Direct messages (the members-only chat / mailbox).
--
-- 1:1 private messages. A row is visible ONLY to its two parties — there is no
-- admin-read policy: private messages stay private. The safety model the league
-- asked for is the MEMBERSHIP GATE, not surveillance: you can only send/receive
-- if you are a known community member — linked to a player, or holding a role
-- (coach / content_editor / judge / player), or an admin. Guests can't chat.
--
-- Unread DMs are surfaced on the chat icon's own badge (NOT the notification
-- bell), so the two never double-count.
-- ============================================================================

-- Membership predicate, reused by the RLS insert check + the directory RPC.
-- SECURITY DEFINER so it can read admin_users / user_roles / profiles for any
-- uid (e.g. the recipient) regardless of the caller. Leaks nothing but a bool.
create or replace function public.is_member(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users a join auth.users au on au.email = a.email where au.id = u)
      or exists (select 1 from public.user_roles r where r.user_id = u)
      or exists (select 1 from public.profiles p where p.id = u and p.player_id is not null);
$$;
revoke execute on function public.is_member(uuid) from public, anon;
grant  execute on function public.is_member(uuid) to authenticated;

create table if not exists public.direct_messages (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body         text not null check (char_length(body) between 1 and 2000),
  read_at      timestamptz,
  created_at   timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

create index if not exists dm_recipient_idx      on public.direct_messages (recipient_id, created_at desc);
create index if not exists dm_sender_idx         on public.direct_messages (sender_id, created_at desc);
create index if not exists dm_recipient_unread_idx on public.direct_messages (recipient_id) where read_at is null;

alter table public.direct_messages enable row level security;

drop policy if exists "read own dms"   on public.direct_messages;
drop policy if exists "send dms"        on public.direct_messages;
drop policy if exists "update own dms"  on public.direct_messages;

-- read threads you're part of
create policy "read own dms" on public.direct_messages for select to authenticated
  using (auth.uid() in (sender_id, recipient_id));

-- send as yourself, ONLY between members
create policy "send dms" on public.direct_messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_member(auth.uid()) and public.is_member(recipient_id));

-- mark-read (recipient) — either party may update rows they're in
create policy "update own dms" on public.direct_messages for update to authenticated
  using (auth.uid() in (sender_id, recipient_id))
  with check (auth.uid() in (sender_id, recipient_id));

-- Live delivery.
do $$ begin
  alter publication supabase_realtime add table public.direct_messages;
exception when others then null; end $$;

-- Flood guard: cap a sender at 20 messages / rolling minute. This one is meant
-- to BLOCK (unlike the best-effort notification triggers).
create or replace function public.enforce_dm_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare c int;
begin
  select count(*) into c from public.direct_messages
   where sender_id = NEW.sender_id and created_at > now() - interval '1 minute';
  if c >= 20 then
    raise exception 'dm_rate_limit';
  end if;
  return NEW;
end; $$;
drop trigger if exists trg_dm_rate_limit on public.direct_messages;
create trigger trg_dm_rate_limit before insert on public.direct_messages
  for each row execute function public.enforce_dm_rate_limit();
revoke execute on function public.enforce_dm_rate_limit() from public, anon, authenticated;

-- Directory for the "new message" picker: every member except, on the client,
-- yourself. Callable by any signed-in user; returns only public profile fields.
create or replace function public.messageable_members()
returns table (id uuid, display_name text, avatar_url text, player_id uuid)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.avatar_url, p.player_id
  from public.profiles p
  where public.is_member(p.id)
  order by p.display_name nulls last;
$$;
revoke execute on function public.messageable_members() from public, anon;
grant  execute on function public.messageable_members() to authenticated;
