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
 * An admin can pin a different photo per card (see attachEventPhotos `overrides`).
 */

function hash(str = "") {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0)
}
const seededPick = (arr, seed) => (arr.length ? arr[hash(seed) % arr.length] : null)

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key)

// Keep the first candidate for each photo_id, preserving priority order. Used for the
// admin "refresh" cycle so clicking never lands on the same photo twice in a row.
function dedupById(list) {
  const seen = new Set()
  const out = []
  for (const p of list) {
    if (!p || seen.has(p.photo_id)) continue
    seen.add(p.photo_id)
    out.push(p)
  }
  return out
}

// Pick from a quality-ranked list, preferring photos not already used; seed adds
// variety within the best tier. Falls back to reuse only if every option is used.
// Mutates `used` with the chosen photo so later events dedup against it.
function autoPick(ranked, finalize, seed, used) {
  if (!ranked.length) return null
  const fresh = ranked.filter(c => !used.has(c.photo.photo_id))
  const pool = fresh.length ? fresh : ranked
  const chosen = seededPick(pool.slice(0, 6), seed)
  if (!chosen) return null
  used.add(chosen.photo.photo_id)
  return finalize(chosen)
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
// Returns intermediate ranked entries; finalizeSolo turns one into a render photo.
function soloRanked(pools, playerId) {
  const cands = pools.byPlayer[playerId]
  if (!cands || !cands.length) return []
  const team = pools.playerTeam[playerId]
  return cands.map(c => {
    const named = pools.photoNamed[c.photo.photo_id] || []
    const others = named.filter(n => n.player_id !== playerId)
    const rivals = others.filter(n => n.team_id && team && n.team_id !== team).length
    return { photo: c.photo, box: c.box, faceH: c.faceH, rivals, others: others.length }
  }).sort((a, b) =>
    (a.rivals - b.rivals) ||   // no players from other teams first
    (b.faceH - a.faceH) ||     // then bigger / clearer face
    (a.others - b.others)      // then the most "solo"
  )
}
// Face center as a 0–1 fraction of the image, from the player's box + the photo's
// original (download-space) dimensions — drives the feed spotlight beam. Null-safe:
// omitted when the box or dims are missing so the renderer falls back to no beam.
function faceCenter(box, w, h) {
  if (!box || !w || !h) return {}
  const cx = ((box.x_min + box.x_max) / 2) / w
  const cy = ((box.y_min + box.y_max) / 2) / h
  if (!(cx >= 0 && cx <= 1) || !(cy >= 0 && cy <= 1)) return {}
  return { faceCx: cx, faceCy: cy }
}
const finalizeSolo = (c) => ({ ...c.photo, box: c.box, mode: "solo", ...faceCenter(c.box, c.photo.width, c.photo.height) })

// One or two teams: rank photos by (no faces from OTHER teams) → (most faces from
// the given teams). Excludes photos with players who weren't in the match.
function teamRanked(pools, allowedTeamIds) {
  if (!allowedTeamIds || !allowedTeamIds.size) return []
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
  ranked.sort((a, b) =>
    (a.bad - b.bad) ||    // no players from teams outside the match first
    (b.good - a.good)     // then the most players from the match teams
  )
  return ranked
}
const finalizeTeam = (c) => ({ ...c.photo, teamFaces: c.good, mode: "group" })

// The ranked candidate list + its finalizer for a single feed item, keyed by type.
// `ranked` holds intermediate scoring entries; `finalize(entry)` yields a render photo.
function candidatesForItem(item, pools) {
  const d = item.data || {}
  if (item.type === "milestone" && d.playerId) {
    return { ranked: soloRanked(pools, d.playerId), finalize: finalizeSolo }
  }
  if (item.type === "top_scorer" && d.player?.id) {
    return { ranked: soloRanked(pools, d.player.id), finalize: finalizeSolo }
  }
  if (item.type === "game_result" && d.game) {
    const g = d.game
    const teams = new Set([g.home_team_id, g.away_team_id].filter(Boolean))
    return { ranked: teamRanked(pools, teams), finalize: finalizeTeam }
  }
  if (item.type === "champion" && d.team?.id) {
    return { ranked: teamRanked(pools, new Set([d.team.id])), finalize: finalizeTeam }
  }
  return { ranked: [], finalize: (c) => c.photo }
}

// The ordered candidate photos (final render shape) for a feed item, deduped by
// photo_id. No cap — the admin "refresh" cycles through every candidate, not just the
// top tier the automatic pick draws from.
export function photoCandidatesFor(item, pools) {
  const { ranked, finalize } = candidatesForItem(item, pools)
  return dedupById(ranked.map(finalize))
}

/**
 * Decorate each feed item with its game photo.
 *
 * @param overrides  { [item_key]: photo_id } — admin-pinned choices. photo_id may be
 *                   null to mean "show no photo". item_key equals the card's post.id.
 *
 * Resolution order per card:
 *   (a) override present with a non-null photo_id → that exact photo (looked up by id).
 *   (b) override present with photo_id === null   → no photo.
 *   (c) otherwise                                 → the automatic, deterministic pick.
 *
 * The automatic pick is computed for every card regardless of overrides, so the shared
 * `used` dedup set — and therefore every automatic pick — stays identical whether or not
 * any card is overridden. Overriding a card never perturbs its neighbours' photos.
 *
 * Pure function: with no `overrides` it reproduces the previous behavior exactly (plus
 * the additive `data.photoCandidates` list the refresh UI cycles through).
 */
export function attachEventPhotos(feed = [], { photos = [], photoPlayers = [], players = [] } = {}, overrides = {}) {
  const pools = buildPhotoPools({ photos, photoPlayers, players })
  const used = new Set()   // dedup: don't reuse a photo across events while a fresh one exists
  const ov = overrides || {}
  return feed.map(item => {
    const { ranked, finalize } = candidatesForItem(item, pools)
    const photoCandidates = dedupById(ranked.map(finalize))
    // Always run the automatic pick so `used` (and thus every auto pick) is override-independent.
    const auto = autoPick(ranked, finalize, item.id, used)

    let photo = auto
    if (hasOwn(ov, item.id)) {
      const id = ov[item.id]
      photo = id == null
        ? null                                                   // (b) explicit "no photo"
        : photoCandidates.find(c => c.photo_id === id)           // (a) pinned candidate
          || (pools.photoById[id] ? finalize({ photo: pools.photoById[id] }) : null)
    }

    // Leave non-photo cards (human posts, or synthetic cards with no matching photo) untouched.
    if (!photoCandidates.length && !photo) return item
    return { ...item, data: { ...item.data, photo, photoCandidates } }
  })
}
