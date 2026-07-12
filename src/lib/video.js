import { supabase } from './supabase'

/**
 * Game video (YouTube) attach + marker timeline. Embed-only: no Data API, no
 * upload, no quota. A live broadcast and its eventual VOD are ONE row (YouTube
 * keeps the same video id), so "is it live now?" is derived from game status by
 * the caller, not stored here. See docs/VIDEO-HIGHLIGHTS-SPEC.md.
 *
 * Reads are public (anon SELECT). Writes are RLS-gated: attaching a video runs
 * through can_stream_game() (admin ∪ content-editor ∪ judge ∪ coach-of-a-team);
 * markers are editor/admin only.
 */

// Parse a YouTube id from any common URL shape (watch?v=, youtu.be/, embed/,
// shorts/, live/) or accept a bare id. Returns null if it can't find one.
export function parseYouTubeId(input) {
  const s = (input || '').trim()
  if (!s) return null
  if (/^[\w-]{6,32}$/.test(s) && !s.includes('/')) return s
  const m = s.match(/(?:[?&]v=|\/embed\/|\/shorts\/|\/live\/|youtu\.be\/)([\w-]{6,32})/)
  return m ? m[1] : null
}

// Seconds → "m:ss" / "h:mm:ss" for marker labels (renders LTR in the RTL UI).
export function fmtClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

// A game's primary video + its markers (ordered for the timeline), or null when
// the game has no video. Public read — safe for anon spectators.
export async function getGameVideo(gameId) {
  if (!gameId) return null
  const { data: videos, error } = await supabase
    .from('game_videos')
    .select('id, video_id, title, kind, clock_offset_seconds, is_primary, created_at')
    .eq('game_id', gameId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: false })
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

// Editor/streamer: attach a video to a game. `kind` is 'live' while the game is
// in progress; it becomes the VOD replay unchanged after the game ends. Returns
// the new row; throws a Hebrew message on a bad URL or an RLS refusal.
export async function attachVideo(gameId, { url, kind = 'full', offset = 0 } = {}) {
  const video_id = parseYouTubeId(url)
  if (!video_id) throw new Error('קישור YouTube לא תקין')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('יש להתחבר')
  const { data, error } = await supabase
    .from('game_videos')
    .insert({ game_id: gameId, video_id, kind, clock_offset_seconds: offset, created_by: user.id })
    .select('id, video_id, kind')
    .single()
  if (error) throw error
  return data
}

// Editor/streamer: remove a video (and its markers, via FK cascade). Selects the
// row back so a silently-refused delete (RLS → 0 rows) surfaces as an error.
export async function detachVideo(id) {
  const { data, error } = await supabase.from('game_videos').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('המחיקה נחסמה — אין הרשאה')
}

// Editor: add a marker. video_seconds comes from player.getCurrentTime().
export async function addMarker(videoRef, { videoSeconds, kind, label = null, playerId = null, teamId = null } = {}) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('game_video_markers')
    .insert({
      video_ref: videoRef,
      video_seconds: Math.max(0, Math.round(videoSeconds || 0)),
      kind,
      label: label ? String(label).slice(0, 120) : null,
      player_id: playerId,
      team_id: teamId,
      source: 'manual',
      created_by: user?.id ?? null,
    })
    .select('id, video_seconds, kind, label, player_id, team_id, source')
    .single()
  if (error) throw error
  return data
}

// Editor: delete a marker. Selects back so an RLS refusal surfaces.
export async function deleteMarker(id) {
  const { data, error } = await supabase.from('game_video_markers').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('המחיקה נחסמה — אין הרשאה')
}

// Realtime: a spectator already on /games/:id should see a video pop in the
// moment the streamer goes live, without reloading. Invokes cb() on any change
// to this game's videos; caller re-fetches via getGameVideo. No-op-safe if
// Realtime is unreachable. Mirrors subscribeLiveGame in lib/live.js.
export function subscribeGameVideo(gameId, cb) {
  if (!gameId) return () => {}
  const channel = supabase
    .channel(`game_video:${gameId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'game_videos', filter: `game_id=eq.${gameId}` },
      () => cb(),
    )
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}
