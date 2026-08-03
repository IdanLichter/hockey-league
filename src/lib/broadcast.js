import { supabase } from './supabase'

/**
 * League-manager broadcast (P4 — sheet row 25). One message to everyone involved in a
 * single game: both squads, anyone manually added, and the two coaches. The canonical
 * example from the sheet is "המשחק עשוי לעבור לביאליק בגלל גשם" — a heads-up, before
 * anything is decided.
 *
 * Its automatic sibling is row 26: once the venue or kick-off actually changes, a
 * trigger notifies the same audience with no one having to remember (see
 * supabase/lm-broadcast.sql).
 */

export const BROADCAST_MAX = 500

/** Send to everyone involved in this game. Returns how many were notified. */
export async function broadcastToGame(gameId, message) {
  const { data, error } = await supabase.rpc('broadcast_to_game', {
    p_game_id: gameId, p_message: message,
  })
  if (error) {
    const msg = error.message || ''
    if (/message is required/i.test(msg)) throw new Error('יש להזין הודעה')
    if (/too long/i.test(msg)) throw new Error(`ההודעה ארוכה מדי (עד ${BROADCAST_MAX} תווים)`)
    if (/not authorized/i.test(msg)) throw new Error('אין לך הרשאה לשלוח הודעה')
    throw new Error('שליחת ההודעה נכשלה')
  }
  return data ?? 0
}

/** How many people this game's message would reach (accounts only). */
export async function getGameAudienceSize(gameId) {
  if (!gameId) return 0
  const { data, error } = await supabase.rpc('game_audience', { p_game: gameId })
  if (error) return 0
  return (data || []).length
}
