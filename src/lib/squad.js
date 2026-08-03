import { supabase } from './supabase'

/**
 * Manual squad management (P1 — sheet rows 7, 8, 13, 14, 15, 33).
 *
 * A coach builds his squad before kick-off; once the game is running it is the judge's
 * sheet, so the judge (and admin / league manager) may add at any time. Every rule is
 * enforced server-side in add_player_to_squad — a valid medical, no active red-card
 * block, and the coach's age confirmation — so these helpers only translate the
 * refusals into something a coach can act on.
 *
 * Note the deliberate asymmetry with the judge's free-text guest on the scoresheet:
 * a manually added squad player must be a real player card, because the medical and
 * red-card checks have nothing to check against otherwise.
 */

export const SQUAD_ERRORS = {
  'no valid medical':     'לשחקן אין בדיקה רפואית מאושרת בתוקף',
  'suspended':            'השחקן מורחק בגלל כרטיס אדום ואינו יכול לשחק במשחק הבא',
  'age not confirmed':    'יש לאשר שהשחקן עומד בדרישת הגיל',
  'team not in this game': 'הקבוצה אינה משתתפת במשחק זה',
  'game already started': 'המשחק כבר התחיל — רק שופט יכול להוסיף שחקן',
  'not authorized':       'אין לך הרשאה להוסיף שחקן למשחק זה',
  'player not found':     'השחקן לא נמצא',
  'game not found':       'המשחק לא נמצא',
  'not a manual entry':   'אפשר להסיר רק שחקן שנוסף ידנית',
  'not in this game':     'השחקן אינו שייך לאחת מהקבוצות במשחק',
}

function squadError(e) {
  const msg = String(e?.message || '')
  for (const [key, he] of Object.entries(SQUAD_ERRORS)) {
    if (msg.includes(key)) return new Error(he)
  }
  return new Error('הפעולה נכשלה, נסו שוב')
}

/**
 * Add a player to a game's squad for a specific team.
 * `ageConfirmed` must be true — the coach vouches for eligibility, since the schema
 * holds no birth date to check "14 או כיתה ח" against.
 */
export async function addPlayerToSquad(gameId, playerId, teamId, { note = null, ageConfirmed = false } = {}) {
  const { error } = await supabase.rpc('add_player_to_squad', {
    p_game_id: gameId,
    p_player_id: playerId,
    p_team_id: teamId,
    p_note: note,
    p_age_confirmed: !!ageConfirmed,
  })
  if (error) throw squadError(error)
}

/** Remove a manually added player (never a player's own declaration). */
export async function removePlayerFromSquad(gameId, playerId) {
  const { error } = await supabase.rpc('remove_player_from_squad', {
    p_game_id: gameId, p_player_id: playerId,
  })
  if (error) throw squadError(error)
}

/**
 * The player's active red-card block, or null. Lets the UI disable the מגיע button with
 * a reason up front instead of letting him press it and get a refusal.
 */
export async function getActiveSuspension(playerId) {
  if (!playerId) return null
  const { data, error } = await supabase.rpc('active_suspension', { p_player: playerId })
  if (error) return null
  return (Array.isArray(data) ? data[0] : data) || null
}

/**
 * The full squad for a game: roster players who answered, plus manually added players.
 * The latter are on neither roster, so a players-by-team query cannot find them —
 * which is exactly why this goes through a definer RPC rather than a table read.
 * Returns [] for anyone not entitled to see it rather than throwing.
 */
export async function getGameSquad(gameId) {
  if (!gameId) return []
  const { data, error } = await supabase.rpc('game_squad', { p_game_id: gameId })
  if (error) return []
  return data || []
}
