-- Venues (#4/#3) — 2026-07-17. Applied to prod via MCP migration `venues_table`.
-- A first-class list of courts. Public-readable (venue names show on game pages);
-- admins + league managers manage it. game.venue stays a name string; inputs become
-- a dropdown from this list. Seeded from venue names already in games/teams.
create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (name)
);
alter table public.venues enable row level security;
create policy "venues public read" on public.venues for select using (true);
create policy "venues admin/lm write" on public.venues for all to authenticated
  using (public.is_admin() or public.is_league_manager())
  with check (public.is_admin() or public.is_league_manager());

insert into public.venues (name)
  select distinct trim(v) from (
    select venue as v from public.games where venue is not null and trim(venue) <> ''
    union
    select home_venue from public.teams where home_venue is not null and trim(home_venue) <> ''
  ) s
  where trim(v) <> ''
  on conflict (name) do nothing;
