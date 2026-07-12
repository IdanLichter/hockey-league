# Video Highlights — Build Spec (web app)

**Status:** proposed · **Author:** derived from `HockeyTimer-iOS/ROADMAP.md` §8 · **Date:** 2026-07-12
**Scope:** the league website (`hockey-league/`) only. The CV/analysis workstream (`video-analysis/`) and any native uploads are explicitly **out of scope**.

---

## 0. TL;DR

Let a gated user paste a **YouTube link** onto a game — **live or after the fact**. The website embeds the player on `/games/:id` for every spectator (web + mobile) and shows a **clickable timeline of markers** (goals, penalties, periods). Public visitors watch + jump; editors attach the video and place markers.

- **Live streaming (Path A, §6b):** while a game is in progress, a person at the rink goes live in the YouTube/Streamlabs app and pastes the link — it lights up an embedded **🔴 live** player on web **and** mobile, next to the existing live scoreboard. When the game ends, YouTube keeps the same video ID and it becomes the replay automatically — **the live stream and the VOD are one row**.
- **Zero new infra, zero recurring cost, zero OAuth.** Embed-only via the YouTube **IFrame Player API** (a free `<script>`, no Data API, no quota, no upload pipeline). Same manual link-paste flow as photo albums today.
- **Two tables, one lib module, one component, one gate** (`is_content_editor() OR is_admin()`, extendable to the game's judge — already exists).
- Ships **without** any change to the timer/live engine.
- **Not** a one-tap camera button (that's native-only Path B, deliberately out of scope here — see §7 / the separate Path B discussion).

---

## 1. Reality check — what the roadmap assumed vs. what exists

ROADMAP §8 says: *"we already record every goal/penalty/period against the game clock — this is what makes auto-highlights tractable."* **This is not true of the web backend.** Verified against the live schema (2026-07-12):

| Table | What it actually holds | Usable as an event log? |
|---|---|---|
| `game_stats` | Aggregate **counts** per player per game: `goals`, `blue_cards`, `red_cards`, `clean_sheet` | ❌ No timestamps |
| `games` | Final `home_score`/`away_score`, date, venue, status | ❌ Score only, no events |
| `live_game_state` | **One mutable snapshot** per live game (score, `clock_ends_at`, `period`, `phase`, `state jsonb`), overwritten on every broadcast | ❌ Not append-only; no history |

The HockeyTimer / live judge engine *does* track events during a game (`GamePersistence`), but only the **final aggregate** is persisted to the league DB. **No timestamped goal/penalty log exists.**

**Design consequence:** the seek target for a marker is a **video timestamp** the editor captures by scrubbing — never derived from game data. Auto-generation is a separate, later tier that depends on infrastructure we don't have yet. The schema is built so that tier drops in without a migration to the marker table.

---

## 2. Architecture (embed-only)

```
Human ──uploads game──▶ League YouTube channel (unlisted)
   │                          │
   │ pastes link              │ video_id
   ▼                          ▼
Editor UI on /games/:id ──▶ game_videos (game_id, video_id, offset)
   │  scrubs + "mark here"        │
   ▼                              ▼
game_video_markers (video_seconds, kind, label, player_id)
                                  │
Public /games/:id ◀── YouTube IFrame Player API (seekTo) ◀── markers
```

Nothing calls a Google API. The only external dependency at runtime is the IFrame API `<script>`, loaded lazily and once.

---

## 3. Data model

New migration: **`supabase/video-highlights.sql`** (+ `-down.sql`) — written & applied. Convention matches `content-editor.sql`. Gate decided: **attaching a video (incl. go-live) = `can_stream_game()`** = admin ∪ content-editor ∪ judge ∪ coach-of-either-team; **curating markers = admin ∪ content-editor**. See the migration file for the exact SQL (this section is the design summary).

```sql
-- ============================================================================
-- Video highlights (2026-07-12): attach a YouTube video to a game + a clickable
-- marker timeline. Embed-only — no Data API, no upload, no quota. Writes gated
-- to is_admin() OR is_content_editor() (mirrors face_clusters). Public read.
-- ============================================================================

-- One video per game in practice, but the table allows several (full game +
-- a highlights cut). `clock_offset_seconds` is ONLY consumed by the future
-- auto-marker generator (§7); manual markers ignore it and store video_seconds
-- directly.
create table if not exists public.game_videos (
  id                   uuid primary key default gen_random_uuid(),
  game_id              uuid not null references public.games(id) on delete cascade,
  provider             text not null default 'youtube' check (provider in ('youtube')),
  video_id             text not null check (char_length(video_id) between 6 and 32),
  title                text,
  kind                 text not null default 'full' check (kind in ('full','highlights','live')),
  clock_offset_seconds integer not null default 0,
  is_primary           boolean not null default true,
  created_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now()
);
create index if not exists game_videos_game_idx on public.game_videos(game_id);

-- A marker is a labelled seek target. `video_seconds` is the source of truth —
-- what player.seekTo() receives. `source` distinguishes editor-placed vs the
-- future auto-generated ones so we can regenerate/replace only the auto set.
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

-- Public read (spectators). No secret data here.
create policy "Public read game_videos"  on public.game_videos        for select using (true);
create policy "Public read game_markers"  on public.game_video_markers for select using (true);

-- Writes: content editors + admins only (same predicate as face_clusters).
create policy "Editors write game_videos" on public.game_videos for all to authenticated
  using (is_admin() or is_content_editor()) with check (is_admin() or is_content_editor());
create policy "Editors write game_markers" on public.game_video_markers for all to authenticated
  using (is_admin() or is_content_editor()) with check (is_admin() or is_content_editor());
```

`-down.sql`: `drop table if exists public.game_video_markers; drop table if exists public.game_videos;`

**RLS note:** follow the house pattern — after every editor `update`/`delete`, `.select()` the row back so a silently-refused write (RLS returns 0 rows, not an error) surfaces instead of a fake success. See `reopenCluster` in `src/lib/media.js`.

---

## 4. Client lib — `src/lib/video.js`

Thin functions over `supabase`, mirroring `src/lib/media.js`.

```js
import { supabase } from './supabase'

// Parse a YouTube id from any common URL shape (watch?v=, youtu.be/, embed/,
// shorts/, live/) or accept a bare id. Returns null if it can't.
export function parseYouTubeId(input) {
  const s = (input || '').trim()
  if (/^[\w-]{6,32}$/.test(s) && !s.includes('/')) return s
  const m = s.match(/(?:v=|\/embed\/|\/shorts\/|\/live\/|youtu\.be\/)([\w-]{6,32})/)
  return m ? m[1] : null
}

// A game's video(s) + all markers, ordered for the timeline. Public read.
export async function getGameVideo(gameId) {
  const { data: videos, error } = await supabase
    .from('game_videos')
    .select('id, video_id, title, kind, clock_offset_seconds, is_primary')
    .eq('game_id', gameId)
    .order('is_primary', { ascending: false })
  if (error) throw error
  if (!videos?.length) return null
  const primary = videos[0]
  const { data: markers, error: e2 } = await supabase
    .from('game_video_markers')
    .select('id, video_seconds, kind, label, player_id, team_id, source')
    .eq('video_ref', primary.id)
    .order('video_seconds', { ascending: true })
  if (e2) throw e2
  return { ...primary, markers: markers || [] }
}

// Editor: attach a video to a game. Returns the row (surfaces RLS refusal).
export async function attachVideo(gameId, { url, kind = 'full', offset = 0 }) {
  const video_id = parseYouTubeId(url)
  if (!video_id) throw new Error('קישור YouTube לא תקין')
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase.from('game_videos')
    .insert({ game_id: gameId, video_id, kind, clock_offset_seconds: offset, created_by: user?.id })
    .select('id, video_id').single()
  if (error) throw error
  return data
}

// Editor: add / delete a marker. video_seconds comes from player.getCurrentTime().
export async function addMarker(videoRef, { videoSeconds, kind, label, playerId = null, teamId = null }) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase.from('game_video_markers')
    .insert({ video_ref: videoRef, video_seconds: Math.round(videoSeconds), kind,
              label: label?.slice(0, 120) || null, player_id: playerId, team_id: teamId,
              source: 'manual', created_by: user?.id })
    .select('id').single()
  if (error) throw error
  return data
}

export async function deleteMarker(id) {
  const { data, error } = await supabase.from('game_video_markers').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('המחיקה נחסמה — אין הרשאה')
}

export async function detachVideo(id) {
  const { data, error } = await supabase.from('game_videos').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('המחיקה נחסמה — אין הרשאה')
}
```

---

## 5. Component — `src/components/GameVideo.jsx`

Responsibilities:
- Lazy-load the IFrame API once (inject `https://www.youtube.com/iframe_api`, resolve on `onYouTubeIframeAPIReady`). Guard against double-injection.
- 16:9 responsive player (`aspect-video`, already a Tailwind util used in `Media.jsx`).
- **Timeline strip** under the player: one tick per marker, positioned by `video_seconds / duration`; click → `player.seekTo(sec, true)`; colour by `kind` (goal = emerald, penalty = red, period = slate — reuse the `StatPills` palette in `GameDetail.jsx`).
- **Chapter list**: markers grouped by kind, each a Hebrew row (`⚽ גול — דני כהן · 12:34`) that seeks on click. Goals link to the player via `PlayerLink` for per-player reels.
- **Editor toolbar** (only when `isEditor`): "סמן מיקום נוכחי" reads `player.getCurrentTime()` → opens a tiny kind/label/scorer form → `addMarker`. Each marker row gets a delete affordance.

Key contract notes:
- Markers store **video seconds**; the component never does clock math. (The `clock_offset_seconds` field is untouched until §7.)
- Format seconds → `m:ss` for labels.
- No new npm dep — the IFrame API is a runtime script, consistent with how the app already pulls YouTube-free but external-script-tolerant code. If you prefer zero JS API, a fallback is a plain `<iframe src="…?start=SEC">` reloaded per seek, but that reloads the video each click — **use the IFrame API**.

Editor detection: reuse the role signal already wired for the content-editor tab (the same check that guards the `/creators` moderation UI — an `isContentEditor`/`isAdmin` flag from `AuthContext`/roles). Do **not** invent a new gate.

---

## 6. Wiring into `GameDetail.jsx`

One import + one block. Place it **after the scoreboard header, before the box score** (natural reading order: watch, then read the stats). Render when a video exists **or** the viewer is an editor (so editors always see the attach affordance):

```jsx
import GameVideo from "@/components/GameVideo"
// …inside the return, after the HEADER card:
<GameVideo gameId={id} home={home} away={away} players={players} />
```

`GameVideo` internally: fetches `getGameVideo(gameId)`; renders nothing for a public visitor when there's no video; renders the "attach a video" card for an editor when there's none.

**RTL:** the timeline runs right-to-left with the rest of the UI; the `m:ss` labels render LTR (wrap in `dir="ltr"` like the score in `GameDetail.jsx`, per the RTL-score gotcha).

---

## 6b. Live "Go Live" flow (Path A) — the headline feature

While a game is live, a person **physically at the rink** goes live in the YouTube (or Streamlabs) app and pastes the link; it appears as an embedded **live** player for every spectator on web **and** mobile, next to the existing live scoreboard. When the game ends, YouTube keeps the same video ID and converts it to VOD — so the identical row becomes the game's replay with **zero extra work**.

**No schema change.** `kind='live'` already exists in the `game_videos` check (§3). "Is it live *right now*?" is **derived, not stored**: show the live treatment when the game's `status === 'in_progress'` (or a `live_game_state` row exists). After the game completes the 🔴 badge drops and the same embed plays as replay. Optionally an editor flips `kind` `'live'→'highlights'` afterward — cosmetic only.

**Who can go live (gating decision — pick before M1).** The streamer is at the rink, so the natural people are:
- Default (matches every other write in the app): `is_admin() OR is_content_editor()`.
- **Recommended for live:** also the game's **judge** — they already run the scoreboard on site — via `OR is_judge()` (the helper exists; see `content-editor.sql`). Coaches of the two teams optional (team-scoped).
- **Not** open to all fans (avoids chaos / duplicate streams / moderation load). This is the §3 write policy on `game_videos`.

**Streamer flow (same UI on web editor + native apps):**
1. On a live game, gated users see a **"התחל שידור חי"** button in/beside the `LiveGame` block.
2. Tap → 3-step Hebrew instructions: (a) open YouTube/Streamlabs and go live **as unlisted**, (b) copy the link, (c) paste below.
3. Paste field → `attachVideo(gameId, { url, kind: 'live' })` (already in §4; `parseYouTubeId` handles `youtube.com/live/…`, `youtu.be/…`, `watch?v=…`).
4. **"הסר שידור"** detaches a wrong link (`detachVideo`).

**Spectator flow (web + mobile):**
- `GameVideo` renders the embedded player with a red **"🔴 שידור חי"** badge above the live scoreboard while the game is in progress.
- **Auto-appear (no reload):** a spectator already on the page when the streamer goes live should see it pop in. Piggyback on the existing `subscribeLiveGame` tick (re-run `getGameVideo` when the live row changes), **or** add a tiny Realtime subscription on `game_videos` filtered by `game_id` — mirror `subscribeLiveGame` in `src/lib/live.js`.
- **Latency:** the video is ~5–30s behind the scoreboard (low-latency ~2–5s). Do **not** attempt to hard-sync the two; just show both.

**Mobile apps get it for free (schema-wise).** They already read Supabase; to render, embed the YouTube player — simplest is a WebView iframe (`youtube.com/embed/VIDEO_ID?autoplay=1`) or the native youtube-player SDKs. That's a `MOBILE-BUILD/` task, not this web PR, but the tables serve both with no changes.

**Upload reality check:** 720p live needs ~2–6 Mbps upload from the rink phone (wifi/LTE dependent); arena background music can trigger Content-ID → muted stream (§8). Surface a one-line warning in the "Go Live" instructions.

---

## 7. Future tier — auto-markers (NOT in this PR)

Only becomes possible once **a timestamped event log is persisted** (e.g. the live/judge engine writes each goal/penalty with its game-clock time, or an editor logs events live). When that exists:

- Store `clock_offset_seconds` on `game_videos` = video time at which the game clock shows the start of period 1.
- Generate `source='auto'` markers: `video_seconds = clock_offset_seconds + elapsed_game_seconds(event)`. (Note the app's clock counts **down** from a deadline — `elapsed = period_length − remaining`.)
- Regeneration replaces only `source='auto'` rows; editor `manual` markers are never clobbered.

This is a genuinely separate project (needs the event log first) and must not block or complicate §3–6.

---

## 8. Privacy, consent, caveats (carried from ROADMAP §8)

- **Minors + consent:** games feature minors. Default to **unlisted** uploads; add a one-line consent note in the editor attach UI and a link in `/privacy`. Do not embed videos flagged as containing an objecting player.
- **Content-ID:** arena background music can trigger claims → muted/blocked video. Editor-facing note: mute or use a music-free cut.
- **Ownership:** YouTube can take down / age-restrict / ad-inject. Acceptable for embed-only VOD; the "keep our own original" concern is a CV-workstream problem, not this PR's.
- **No quota:** embed-only ⇒ no Data API ⇒ no daily quota, no key, no OAuth.

---

## 9. Milestones

| # | Deliverable | Status |
|---|---|---|
| **M1** | Migration `video-highlights.sql` applied + RLS verified | ✅ **DONE** — applied to prod (`video_highlights` + `_can_stream_coalesce`); rehearsed via txn-rollback first; anon-read ✓, anon-stream gate = false ✓ |
| **M2** | `src/lib/video.js` + `GameVideo.jsx` (playback + timeline + chapters) | ✅ **DONE** |
| **M3** | Editor mode: attach video, mark position, delete marker | ✅ **DONE** |
| **M4** | `/games/:id` wiring + build + verify in preview | ✅ **DONE** — prod build green; rendered on a live game (🔴 badge + YT embed + chapters) via read_page |
| **M4b** | **Live "Go Live" flow (§6b):** gated paste-link + 🔴 badge + auto-appear via Realtime | ✅ **DONE** |
| **Deploy** | Commit + push to `main` → Vercel | ⏳ **PENDING** — code is local-only; DB is already live |
| **M5** (opt) | `/highlights` gallery: games that have a video, newest first | ⬜ follow-up |
| **M6** (future) | Auto-markers from a real event log (§7) | ⬜ needs event log |

**Built & verified locally + DB live in prod. Remaining: deploy the front-end.** M5 is a small follow-up. M6 is a separate future project. The native one-tap camera button is Path B, a separate spec.

---

## 10. Open questions for Ariel

1. **Whose YouTube channel?** A dedicated league channel (recommended) vs. individuals' uploads. Affects the unlisted/consent policy.
2. **Who attaches videos** — content-editors only, or also team coaches for their own games? (Coach role is team-scoped; easy to extend the RLS predicate if wanted.)
3. **Highlights gallery** (`/highlights`, M5) now or later?
4. **Consent mechanism** — is an unlisted-by-default + privacy-policy line enough for v1, or do we need per-player opt-out before launch?
