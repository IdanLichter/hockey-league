import { supabase } from './supabase'

/**
 * Game availability (#3 apply-to-play). A rostered player declares whether they're
 * coming to an upcoming game; the team's coach (or an admin) sees the roster.
 * Writes go through the set_game_availability RPC (self-scoped to the caller's own
 * linked player); reads are RLS-scoped (the player sees their own row, a coach/admin
 * sees their team's).
 */

/** The current user's availability status for a game ('available'|'unavailable'|null). */
export async function getMyAvailability(gameId, playerId) {
  if (!gameId || !playerId) return null
  const { data, error } = await supabase
    .from('game_availability')
    .select('status')
    .eq('game_id', gameId)
    .eq('player_id', playerId)
    .maybeSingle()
  if (error) return null
  return data?.status ?? null
}

/** Set the current user's availability via the self-scoped RPC. Signing up as
 *  "available" requires a valid approved medical certificate (enforced server-side). */
export async function setMyAvailability(gameId, status) {
  const { error } = await supabase.rpc('set_game_availability', { p_game_id: gameId, p_status: status })
  if (error) {
    if (/no valid medical/i.test(error.message || '')) throw new Error('no-valid-medical')
    throw error
  }
}

/** All availability rows for a game the caller may read (coach → their team; admin → all). */
export async function getGameAvailability(gameId) {
  if (!gameId) return []
  const { data, error } = await supabase
    .from('game_availability')
    .select('player_id,status')
    .eq('game_id', gameId)
  if (error) return []
  return data || []
}

/** Officials (judge/admin): availability for a game via a definer RPC (judges can't
 *  read the table via RLS). Used to default the scoreboard roster to attendees. */
export async function getGameAvailabilityForOfficial(gameId) {
  if (!gameId) return []
  const { data, error } = await supabase.rpc('game_availability_for_official', { p_game_id: gameId })
  if (error) return []
  return data || []
}

/** Officials (judge/admin): availability across several games via a definer RPC →
 *  attendance chips on the referee page. Returns [{game_id, player_id, status}]. */
export async function getAvailabilityForOfficialBatch(gameIds) {
  const ids = (gameIds || []).filter(Boolean)
  if (!ids.length) return []
  const { data, error } = await supabase.rpc('game_availability_for_official_batch', { p_game_ids: ids })
  if (error) return []
  return data || []
}

/** Availability rows across several games (RLS-scoped) → for the games-list coach chips. */
export async function getAvailabilityForGames(gameIds) {
  const ids = (gameIds || []).filter(Boolean)
  if (!ids.length) return []
  const { data, error } = await supabase
    .from('game_availability')
    .select('game_id,player_id,status')
    .in('game_id', ids)
  if (error) return []
  return data || []
}
