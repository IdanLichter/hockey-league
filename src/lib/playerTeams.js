import { supabase } from './supabase'
import { updatePlayer } from './api'
import { DEFAULT_AGE, ageOf } from './ageGroups'

/**
 * player_teams is the source of truth for roster membership: a player may belong
 * to at most ONE team per age group (senior league + youth tournaments). The DB
 * derives each row's age_group from its team and enforces one-per-age-group.
 * `players.team_id` is kept as a "primary" (senior-preferred) mirror for the many
 * single-team displays; see supabase/player-teams.sql.
 */

/** Every membership row, paged past PostgREST's 1000-row cap. */
export async function getPlayerTeams() {
  const out = []
  const size = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('player_teams')
      .select('player_id, team_id, age_group')
      .order('player_id', { ascending: true })
      .range(from, from + size - 1)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < size) break
    from += size
  }
  return out
}

/**
 * Build lookup maps from membership rows. `players` is optional but recommended:
 * each player's primary team_id is unioned in as a safety net so a roster can
 * never lose a player if a membership row is missing.
 *   → { byTeam: Map<teamId, Set<playerId>>, byPlayer: Map<playerId, [{team_id, age_group}]> }
 */
export function buildMemberMaps(rows = [], players = []) {
  const byTeam = new Map()
  const byPlayer = new Map()
  const add = (teamId, playerId, ageGroup) => {
    if (!teamId || !playerId) return
    if (!byTeam.has(teamId)) byTeam.set(teamId, new Set())
    byTeam.get(teamId).add(playerId)
    if (!byPlayer.has(playerId)) byPlayer.set(playerId, [])
    const list = byPlayer.get(playerId)
    if (!list.some(m => m.team_id === teamId)) list.push({ team_id: teamId, age_group: ageGroup })
  }
  for (const r of rows) add(r.team_id, r.player_id, r.age_group)
  // Fallback: the primary team always counts (real-age rows already added win the dedupe).
  for (const p of players) if (p?.team_id) add(p.team_id, p.id, null)
  return { byTeam, byPlayer }
}

/** True if the player belongs to the team (membership map, with primary fallback). */
export function isMember(byTeam, teamId, playerId) {
  return !!byTeam.get(teamId)?.has(playerId)
}

/** The team ids a player belongs to, across all age groups. */
export function teamIdsForPlayer(byPlayer, playerId) {
  return (byPlayer.get(playerId) || []).map(m => m.team_id)
}

/**
 * Reconcile a player's memberships to exactly `teamIds` (0..N teams, one per age
 * group — the caller/UI guarantees at most one per age group; the DB enforces it
 * too). Inserts the missing rows, deletes the removed ones. age_group is filled
 * by the DB trigger. Then normalises players.team_id to the senior team (else the
 * first) so the "primary" mirror stays sensible.
 */
export async function setPlayerMemberships(playerId, teamIds, teamsById = {}) {
  const want = [...new Set((teamIds || []).filter(Boolean))]

  const { data: existing, error: e1 } = await supabase
    .from('player_teams').select('id, team_id').eq('player_id', playerId)
  if (e1) throw e1

  const have = new Set((existing || []).map(r => r.team_id))
  const wantSet = new Set(want)
  const toRemove = (existing || []).filter(r => !wantSet.has(r.team_id))
  const toAdd = want.filter(t => !have.has(t))

  if (toRemove.length) {
    const { error } = await supabase.from('player_teams').delete().in('id', toRemove.map(r => r.id))
    if (error) throw error
  }
  if (toAdd.length) {
    const { error } = await supabase.from('player_teams')
      .insert(toAdd.map(team_id => ({ player_id: playerId, team_id })))
    if (error) throw error
  }

  // Primary = the senior team in the set, else the first selected, else null.
  const primary = want.find(t => ageOf(teamsById[t]) === DEFAULT_AGE) ?? want[0] ?? null
  await updatePlayer(playerId, { team_id: primary })
  return primary
}
