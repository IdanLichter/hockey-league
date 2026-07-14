-- ============================================================================
-- Stage B0 — accounts / roles / posts foundation
-- ADDITIVE ONLY. Mirrors the existing "public read + gated write" RLS model.
-- Touches NO existing table or policy. Admin gating stays in admin_users.
-- Reverse with supabase/accounts-schema-down.sql.
-- ============================================================================

-- ---------- helper: shared updated_at ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

-- ---------- helper: is the caller an admin? (reuses existing admin_users rule) ----------
-- SECURITY DEFINER so it bypasses RLS on admin_users and never recurses.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select (auth.jwt() ->> 'email') in (select email from public.admin_users)
$$;

-- ---------- profiles (1 row per auth user) ----------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url   text,
  player_id    uuid unique references public.players(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------- user_roles (multi-role per user; granted by admins) ----------
create table public.user_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null check (role in ('player','coach','content_editor','judge','league_manager')),
  team_id    uuid references public.teams(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, role, team_id)
);
create index user_roles_user_id_idx on public.user_roles(user_id);
create index user_roles_team_id_idx on public.user_roles(team_id);

-- ---------- posts (human feed posts; merged into buildFeed in B2) ----------
create table public.posts (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  team_id    uuid references public.teams(id) on delete set null,
  pinned     boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posts_created_at_idx on public.posts(created_at desc);
create index posts_author_id_idx  on public.posts(author_id);
create index posts_team_id_idx    on public.posts(team_id);

create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

-- ---------- helper: may the caller post to the feed? ----------
-- Created AFTER user_roles exists (function body is validated at create time).
create or replace function public.can_post()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin()
      or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid())
$$;

-- ---------- guard: only admins may set/change profiles.player_id (claim = B1) ----------
create or replace function public.guard_profile_player_id()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.player_id is distinct from old.player_id and not public.is_admin() then
    raise exception 'player_id can only be changed by an admin';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_player_id
  before update on public.profiles
  for each row execute function public.guard_profile_player_id();

-- ============================ RLS ============================
alter table public.profiles   enable row level security;
alter table public.user_roles enable row level security;
alter table public.posts      enable row level security;

-- profiles: world-readable (author name/avatar); users edit their own; admins edit any
create policy "Public read profiles" on public.profiles
  for select using (true);
create policy "User insert own profile" on public.profiles
  for insert with check (id = auth.uid());
create policy "User or admin update profile" on public.profiles
  for update using (id = auth.uid() or public.is_admin())
             with check (id = auth.uid() or public.is_admin());

-- user_roles: user reads own, admin reads all; only admins write (grant roles)
create policy "Read own roles or admin" on public.user_roles
  for select using (user_id = auth.uid() or public.is_admin());
create policy "Admin manages roles" on public.user_roles
  for all using (public.is_admin()) with check (public.is_admin());

-- posts: public reads non-deleted (admins also see deleted); can_post() authors own; author/admin edit+delete
create policy "Public read posts" on public.posts
  for select using (deleted_at is null or public.is_admin());
create policy "Can-post users insert own" on public.posts
  for insert with check (author_id = auth.uid() and public.can_post());
create policy "Author or admin update" on public.posts
  for update using (author_id = auth.uid() or public.is_admin())
             with check (author_id = auth.uid() or public.is_admin());
create policy "Author or admin delete" on public.posts
  for delete using (author_id = auth.uid() or public.is_admin());

-- ---------- auto-create a profile on signup + backfill existing users ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',
             new.raw_user_meta_data->>'name',
             split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- backfill profiles for existing auth users (currently the 3 admins)
insert into public.profiles (id, display_name, avatar_url)
select u.id,
       coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email,'@',1)),
       u.raw_user_meta_data->>'avatar_url'
from auth.users u
on conflict (id) do nothing;

-- ---------- hardening: lock trigger-only functions off the public REST RPC ----------
-- (triggers fire regardless of EXECUTE grants; is_admin()/can_post() intentionally
--  stay executable because RLS policies invoke them for anon/authenticated.)
revoke execute on function public.handle_new_user()         from public, anon, authenticated;
revoke execute on function public.guard_profile_player_id() from public, anon, authenticated;
