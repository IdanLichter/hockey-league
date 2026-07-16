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
