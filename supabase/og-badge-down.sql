-- Rollback for og-badge.sql. Ship the web revert FIRST: the client selects og_number,
-- and dropping the column under a live client 400s every players list.
drop function if exists public.ack_og();
drop function if exists public.my_og();
drop index if exists public.players_og_number_key;
alter table public.players drop constraint if exists players_og_number_range;
alter table public.players drop column if exists og_seen_at, drop column if exists og_number;
