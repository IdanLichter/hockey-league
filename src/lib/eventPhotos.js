/**
 * Attach a matching game photo to each auto-generated feed event.
 *
 * Rules (per the product spec):
 *  - single-player event (hat-trick, top scorer)  -> a SOLO photo of that player
 *    (prefer a photo where only that player is recognized), biggest/clearest face.
 *  - team event (game result, champion)           -> a GROUP photo with as many of
 *    that team's recognized players as possible.
 *
 * Selection is deterministically "randomized" by the event id, so each event gets a
 * stable-but-varied photo (no flicker on re-render).
 */

// tiny stable string hash -> non-negative int
function hash(str = "") {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0)
}
const pick = (arr, seed) => (arr.length ? arr[hash(seed) % arr.length] : null)

export function buildPhotoPools({ photos = [], photoPlayers = [] }) {
  const photoById = Object.fromEntries(photos.map(p => [p.photo_id, p]))
  const namedCount = {}                         // photo_id -> # recognized players
  const byPlayer = {}                           // player_id -> [candidate]
  for (const pp of photoPlayers) namedCount[pp.photo_id] = (namedCount[pp.photo_id] || 0) + 1
  for (const pp of photoPlayers) {
    const photo = photoById[pp.photo_id]
    if (!photo) continue
    ;(byPlayer[pp.player_id] ||= []).push({ photo, box: pp.box, faceH: pp.face_h || 0 })
  }
  return { photoById, namedCount, byPlayer, photoPlayers }
}

// Solo photo for one player: prefer photos where they're the ONLY recognized face,
// then the largest face. Randomize among the top few.
function soloPhoto(pools, playerId, seed) {
  const cands = pools.byPlayer[playerId]
  if (!cands || !cands.length) return null
  const scored = cands
    .map(c => ({ ...c, nNamed: pools.namedCount[c.photo.photo_id] || 1 }))
    .sort((a, b) =>
      (a.nNamed - b.nNamed) ||          // fewer other recognized faces first (more "solo")
      (b.faceH - a.faceH)               // then bigger/closer face
    )
  const top = scored.slice(0, 8)
  const chosen = pick(top, seed)
  if (!chosen) return null
  return { ...chosen.photo, box: chosen.box, recognized: [playerId], mode: "solo" }
}

// Group photo for a team: the photo containing the most of that team's players.
function teamPhoto(pools, teamPlayerIds, seed) {
  if (!teamPlayerIds || !teamPlayerIds.size) return null
  const perPhoto = {}                           // photo_id -> {photo, count}
  for (const pid of teamPlayerIds) {
    for (const c of (pools.byPlayer[pid] || [])) {
      const e = (perPhoto[c.photo.photo_id] ||= { photo: c.photo, count: 0 })
      e.count++
    }
  }
  const list = Object.values(perPhoto)
  if (!list.length) return null
  const max = Math.max(...list.map(e => e.count))
  // prefer real group shots (>=2 teammates) when available
  const floor = max >= 2 ? 2 : 1
  const top = list.filter(e => e.count >= Math.min(max, Math.max(floor, max - 1)))
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 8)
  const chosen = pick(top, seed)
  if (!chosen) return null
  return { ...chosen.photo, teamFaces: chosen.count, mode: "group" }
}

export function attachEventPhotos(feed = [], { photos = [], photoPlayers = [], players = [] } = {}) {
  const pools = buildPhotoPools({ photos, photoPlayers })
  const teamPlayerIds = {}                       // team_id -> Set(player_id)
  for (const p of players) {
    if (!p.team_id) continue
    ;(teamPlayerIds[p.team_id] ||= new Set()).add(p.id)
  }
  return feed.map(item => {
    let photo = null
    const d = item.data || {}
    if (item.type === "milestone" && d.playerId) {
      photo = soloPhoto(pools, d.playerId, item.id)
    } else if (item.type === "top_scorer" && d.player?.id) {
      photo = soloPhoto(pools, d.player.id, item.id)
    } else if (item.type === "game_result" && d.game) {
      const g = d.game
      const winnerId = (g.home_score > g.away_score) ? g.home_team_id
                     : (g.away_score > g.home_score) ? g.away_team_id : null
      if (winnerId) photo = teamPhoto(pools, teamPlayerIds[winnerId], item.id)
    } else if (item.type === "champion" && d.team?.id) {
      photo = teamPhoto(pools, teamPlayerIds[d.team.id], item.id)
    }
    return photo ? { ...item, data: { ...item.data, photo } } : item
  })
}
