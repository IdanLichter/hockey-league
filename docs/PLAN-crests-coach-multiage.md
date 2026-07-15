# Plan — Crest storage · Coach team-edit · Player photos · Multi-age join

Status: DRAFT / in progress. Decisions locked with Ariel 2026-07-15.

## Locked decisions
1. **Crest storage** → new **public Supabase Storage bucket `team-logos`**; migrate the 7 existing PNGs into it; `teams.logo_url` stays the single source of truth. Keep `main-logo.png` static (league logo, not a crest).
2. **Multi-age join** → paired user **requests** a team per age group; the **team's coach approves** (extends the existing `team_join_requests` flow to be *additive per age group* instead of a single-team switch).
3. Build **all three** features on the shared Storage foundation.

## Conventions to follow (already in the repo)
- `teams` is **admin-write-only** via RLS; every team write goes through a `SECURITY DEFINER` RPC self-gated on `is_admin() OR is_coach_of(team)` (see `coach-role.sql`, `user-created-teams.sql`).
- Storage upload pattern = the `medical` bucket: client-side `.upload('<scope_id>/<file>')`, storage RLS scoped by folder. Crests bucket is **public-read** (TeamLogo renders a plain `<img src>`), medical is private.
- Existing helpers: `is_coach_of(team)`, `is_linked_player()`, `is_admin()`, `is_league_manager()`.

---

## Feature 0 — Foundation: `team-logos` bucket + migrate 7 crests
**SQL** (`supabase/team-logos-storage.sql`)
- `insert into storage.buckets (id,name,public) values ('team-logos','team-logos',true)`.
- Storage RLS on `storage.objects` for `bucket_id='team-logos'`:
  - `SELECT`: public (anon+auth).
  - `INSERT/UPDATE/DELETE`: `is_admin() OR is_coach_of(folder) OR creator-of-pending-team(folder)`, where `folder = (storage.foldername(name))[1]::uuid = team_id`.
- `set_team_logo(p_team_id uuid, p_url text)` RPC — gated `is_admin() OR is_coach_of(team) OR (created_by=auth.uid() AND status='pending')`; `update teams set logo_url = p_url`.
**Migration of the 7** (`supabase/migrate-crests-to-bucket.md` + script)
- Upload `public/logos/{7 crests}.png` → `team-logos/<team_id>/logo.png` (needs SERVICE_ROLE key; one-off Node script `scripts/upload-crests.mjs`).
- `update teams set logo_url = '<public-url>'` for the 7 known IDs (from `update-logos.sql`).
- Keep `public/logos/*.png` in the repo as a rollback net until verified in prod.

## Feature A — Coach edits team data + crest
**SQL** (`supabase/coach-team-edit.sql`)
- `update_team_details(p_team_id, p_name, p_city, p_home_venue, p_primary_color, p_secondary_color, p_founded_year)` RPC — gated coach/admin; whitelists **non-stats** columns only. Stats (wins/points/goals) stay admin-only (RLS can't column-limit → RPC is the boundary).
**Frontend**
- `api.js`: `updateTeamDetails(...)`, `setTeamLogo(teamId, url)`, `uploadTeamLogo(file, teamId)` (Storage upload helper).
- `TeamDetail.jsx`: show an **"עריכת קבוצה"** button + inline edit form when `isAdmin || coachTeamIds.includes(team.id)`. Fields: name, city, venue, colors, **crest upload** (preview → upload → set_team_logo).
- `CreateTeamModal.jsx`: optional **crest upload** for a new team (upload after `request_team` returns the id; allowed because the RPC/RLS permit the pending team's `created_by`).

## Feature B — Player photo on cards (crest → small badge)
**SQL** — new **public bucket `avatars`** (path `<user_id>/…`, owner-write, public-read) so user photos are real uploads, not URL-paste (else coverage is near-zero). `profiles.avatar_url` unchanged.
**Frontend**
- `api.js getPlayers()`: after fetch, batch-lookup owners `profiles.select('player_id, avatar_url').in('player_id', ids)` and merge `owner_avatar_url` onto each player. (Batched 2nd query, NOT a PostgREST embed — avoids the embed-ambiguity gotcha.)
- New `PlayerAvatar` component: image precedence **owner `avatar_url` → `players.photo_url` → initial circle**, rendered big with `<TeamLogo size={5}>` as a small bottom-corner badge.
- Use `PlayerAvatar` on `Players.jsx` grid cards and `PlayerDetail.jsx` header.
- `Profile.jsx` + `profile.js`: add real **photo upload** to `avatars` bucket (keep URL-paste as fallback).
- Also fixes the QA "white square": that player's `photo_url` is a blank image that loads white; `PlayerAvatar` precedence + a proper fallback removes it.

## Feature C — Multi-age request → coach approve (additive)
**SQL** (`supabase/multi-age-join.sql`) — the delicate one.
- Backfill the missing in-repo bodies of `request_team_join` / `reject_team_join` (currently prod-only) so schema is reproducible.
- `request_team_join(p_team_id, p_note)`: unchanged signature; still one pending request at a time, but interpreted per age group.
- `approve_team_join`: change from **replace** (delete old membership, set single team_id) to **additive per age group** — upsert the `player_teams` row for *this team's age_group* (unique(player_id, age_group) makes it a same-age replace, cross-age add), then normalize `players.team_id` to the senior membership (fallback: keep existing). Update the team-scoped `player` role.
**Frontend**
- `TeamMembershipCard.jsx`: show **one row per age group** with current team + a per-age "request to join / switch / leave". Team dropdown filtered to that age group.
- `teamMembership.js` / `playerTeams.js`: helpers for per-age current membership + request.

## Rollout / safety
- All SQL written as files, applied via Supabase MCP to a **dev branch first** (or prod with explicit go-ahead + verification). Additive & reversible; static crests kept as rollback net.
- Frontend on branch `feature/crests-coach-multiage`; test on local dev (5173) against the DB; then push to main (auto-deploys hockey-league-pro) **and** `bash scripts/deploy-public.sh` to redeploy rinkhockeyil.com.
- Only touch my own files — leave the unrelated uncommitted WIP on main alone.

## Open questions for Ariel
- Player photo upload: OK to add a real `avatars` bucket + in-app photo upload (recommended, else the feature shows for almost nobody)?
- Multi-age: when a paired user requests a team in an age group they're already in, treat as a **switch request** (coach approves the move) — OK?
