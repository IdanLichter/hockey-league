-- ============================================================================
-- Video highlights + live streaming (2026-07-12): attach a YouTube video to a
-- game (live or VOD) + a clickable marker timeline. EMBED-ONLY — no Data API,
-- no upload, no quota. Public read; writes gated. Purely additive (two new
-- tables) — touches no existing table or data.
--
--   game_videos        — a YouTube video attached to a game (live | full | highlights)
--   game_video_markers — labelled seek targets on a video (goal/penalty/…)
--
-- Attaching a video (incl. "go live") is allowed for admins, content-editors,
-- the judge, and coaches of either team in the game (can_stream_game). Curating
-- markers is editor/admin only. Mirrors the RLS style of content-editor.sql.
-- ============================================================================

-- Who may attach / detach a video on a given game. Reuses the existing role
-- helpers (is_admin / is_content_editor / is_judge / is_coach_of). SECURITY
-- DEFINER + anon-executable so it can also back a client-side button gate via
-- rpc(). STABLE: same result within a statement.
create or replace function public.can_stream_game(p_game_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  -- coalesce → always a definite boolean (the role helpers can yield NULL with no
  -- JWT context). NULL would still DENY in an RLS predicate, but a permission
  -- function should return a clean true/false for any caller.
  select coalesce(
    public.is_admin() or public.is_content_editor() or public.is_judge()
     or exists (
       select 1 from public.games g
       where g.id = p_game_id
         and (public.is_coach_of(g.home_team_id) or public.is_coach_of(g.away_team_id))
     ), false);
$$;
grant execute on function public.can_stream_game(uuid) to anon, authenticated;

-- One (or a few) videos per game: the live stream, the full replay, a cut.
-- `clock_offset_seconds` is consumed ONLY by the future auto-marker generator;
-- manual markers store video_seconds directly and ignore it. A live broadcast
-- and its resulting VOD share ONE row (YouTube keeps the same video id), so the
-- "is it live now?" state is DERIVED from the game status, not stored here.
create table if not exists public.game_videos (
  id                   uuid primary key default gen_random_uuid(),
  game_id              uuid not null references public.games(id) on delete cascade,
  provider             text not null default 'youtube' check (provider in ('youtube')),
  video_id             text not null check (char_length(video_id) between 6 and 32),
  title                text check (char_length(title) <= 200),
  kind                 text not null default 'full' check (kind in ('live','full','highlights')),
  clock_offset_seconds integer not null default 0,
  is_primary           boolean not null default true,
  created_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now()
);
create index if not exists game_videos_game_idx on public.game_videos(game_id);

-- A marker is a labelled seek target. `video_seconds` is the source of truth —
-- exactly what player.seekTo() receives. `source` splits editor-placed markers
-- from the future auto-generated set, so a regeneration replaces only 'auto'.
create table if not exists public.game_video_markers (
  id            uuid primary key default gen_random_uuid(),
  video_ref     uuid not null references public.game_videos(id) on delete cascade,
  video_seconds integer not null check (video_seconds >= 0),
  kind          text not null check (kind in ('goal','penalty','period','save','highlight','other')),
  label         text check (char_length(label) <= 120),
  player_id     uuid references public.players(id) on delete set null,
  team_id       uuid references public.teams(id) on delete set null,
  source        text not null default 'manual' check (source in ('manual','auto')),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists game_video_markers_ref_idx on public.game_video_markers(video_ref, video_seconds);

alter table public.game_videos        enable row level security;
alter table public.game_video_markers enable row level security;

-- ---- game_videos: public read, attach/detach gated by can_stream_game -------
drop policy if exists "Public read game_videos"    on public.game_videos;
drop policy if exists "Streamers write game_videos" on public.game_videos;
create policy "Public read game_videos" on public.game_videos
  for select using (true);
create policy "Streamers write game_videos" on public.game_videos for all to authenticated
  using (public.can_stream_game(game_id)) with check (public.can_stream_game(game_id));

-- ---- markers: public read, curated by editors/admins only -------------------
drop policy if exists "Public read game_markers"    on public.game_video_markers;
drop policy if exists "Editors write game_markers"  on public.game_video_markers;
create policy "Public read game_markers" on public.game_video_markers
  for select using (true);
create policy "Editors write game_markers" on public.game_video_markers for all to authenticated
  using (public.is_admin() or public.is_content_editor())
  with check (public.is_admin() or public.is_content_editor());
