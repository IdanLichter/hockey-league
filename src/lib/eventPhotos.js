/**
 * Attach a matching game photo to each auto-generated feed event.
 *
 * Rules:
 *  - single-player event (hat-trick, top scorer) -> a photo of that player, ideally
 *    solo; otherwise only with TEAMMATES. Never a photo that also shows rival players.
 *  - match result (two teams)  -> a photo whose recognized faces belong ONLY to those
 *    two teams (most faces from the match wins).
 *  - champion (one team)       -> a photo with that team's players, no other teams.
 *  - the same photo is not reused across events while an unused option exists (dedup).
 *
 * Selection is deterministically "randomized" by the event id → stable but varied.
 */

function hash(str = "") {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0)
}
const seededPick = (arr, seed) => (arr.length ? arr[hash(seed) % arr.length] : null)

// Pick from a quality-ranked list, preferring photos not already used; seed adds
// variety within the best tier. Falls back to reuse only if every option is used.
function pickRanked(ranked, seed, used) {
  if (!ranked.length) return null
  const fresh = ranked.filter(c => !used.has(c.photo.photo_id))
  const pool = fresh.length ? fresh : ranked
  return seededPick(pool.slice(0, 6), seed)
}

export function buildPhotoPools({ photos = [], photoPlayers = [], players = [] }) {
  const photoById = Object.fromEntries(photos.map(p => [p.photo_id, p]))
  const playerTeam = Object.fromEntries(players.map(p => [p.id, p.team_id || null]))
  const photoNamed = {}   // photo_id -> [{ player_id, team_id, faceH }]
  const byPlayer = {}     // player_id -> [{ photo, box, faceH }]
  for (const pp of photoPlayers) {
    ;(photoNamed[pp.photo_id] ||= []).push({
      player_id: pp.player_id, team_id: playerTeam[pp.player_id] ?? null, faceH: pp.face_h || 0,
    })
    const photo = photoById[pp.photo_id]
    if (photo) (byPlayer[pp.player_id] ||= []).push({ photo, box: pp.box, faceH: pp.face_h || 0 })
  }
  return { photoById, photoNamed, byPlayer, playerTeam }
}

// One player: rank by (no rival faces) → (bigger/clearer face) → (more solo).
function soloPhoto(pools, playerId, seed, used) {
  const cands = pools.byPlayer[playerId]
  if (!cands || !cands.length) return null
  const team = pools.playerTeam[playerId]
  const ranked = cands.map(c => {
    const named = pools.photoNamed[c.photo.photo_id] || []
    const others = named.filter(n => n.player_id !== playerId)
    const rivals = others.filter(n => n.team_id && team && n.team_id !== team).length
    return { photo: c.photo, box: c.box, faceH: c.faceH, rivals, others: others.length }
  }).sort((a, b) =>
    (a.rivals - b.rivals) ||   // no players from other teams first
    (b.faceH - a.faceH) ||     // then bigger / clearer face
    (a.others - b.others)      // then the most "solo"
  )
  const chosen = pickRanked(ranked, seed, used)
  if (!chosen) return null
  used.add(chosen.photo.photo_id)
  return { ...chosen.photo, box: chosen.box, mode: "solo" }
}

// One or two teams: rank photos by (no faces from OTHER teams) → (most faces from
// the given teams). Excludes photos with players who weren't in the match.
function teamPhoto(pools, allowedTeamIds, seed, used) {
  if (!allowedTeamIds || !allowedTeamIds.size) return null
  const ranked = []
  for (const photoId in pools.photoNamed) {
    let good = 0, bad = 0
    for (const n of pools.photoNamed[photoId]) {
      if (n.team_id && allowedTeamIds.has(n.team_id)) good++
      else bad++
    }
    if (good < 1) continue
    const photo = pools.photoById[photoId]
    if (photo) ranked.push({ photo, good, bad })
  }
  if (!ranked.length) return null
  ranked.sort((a, b) =>
    (a.bad - b.bad) ||    // no players from teams outside the match first
    (b.good - a.good)     // then the most players from the match teams
  )
  const chosen = pickRanked(ranked, seed, used)
  if (!chosen) return null
  used.add(chosen.photo.photo_id)
  return { ...chosen.photo, teamFaces: chosen.good, mode: "group" }
}

export function attachEventPhotos(feed = [], { photos = [], photoPlayers = [], players = [] } = {}) {
  const pools = buildPhotoPools({ photos, photoPlayers, players })
  const used = new Set()   // dedup: don't reuse a photo across events while a fresh one exists
  return feed.map(item => {
    let photo = null
    const d = item.data || {}
    if (item.type === "milestone" && d.playerId) {
      photo = soloPhoto(pools, d.playerId, item.id, used)
    } else if (item.type === "top_scorer" && d.player?.id) {
      photo = soloPhoto(pools, d.player.id, item.id, used)
    } else if (item.type === "game_result" && d.game) {
      const g = d.game
      const teams = new Set([g.home_team_id, g.away_team_id].filter(Boolean))
      photo = teamPhoto(pools, teams, item.id, used)
    } else if (item.type === "champion" && d.team?.id) {
      photo = teamPhoto(pools, new Set([d.team.id]), item.id, used)
    }
    return photo ? { ...item, data: { ...item.data, photo } } : item
  })
}
