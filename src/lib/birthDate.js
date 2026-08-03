import { supabase } from './supabase'

/**
 * Player date of birth.
 *
 * Lives on the PLAYER CARD rather than only on the user account, because the rule it
 * feeds — a borrowed player must be under 18, or a goalkeeper — is about the player being
 * borrowed, and he is usually exactly the one who never registered. Reading DOB only from
 * signup would leave the rule unable to run precisely when it matters.
 *
 * Writable by the player himself, his coach, or a manager (enforced server-side).
 */

export const YOUTH_MAX_AGE = 18

/** Whole years from a yyyy-mm-dd string, or null when unknown. */
export function ageFromBirthDate(birthDate) {
  if (!birthDate) return null
  const b = new Date(birthDate)
  if (isNaN(b)) return null
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
  return age
}

/** Can this player be borrowed by another team? Under 18, or a goalkeeper of any age. */
export function canBeBorrowed(player) {
  if (!player) return { ok: false, reason: 'unknown' }
  if (player.position === 'Goalkeeper') return { ok: true, reason: 'goalkeeper' }
  const age = ageFromBirthDate(player.birth_date)
  if (age == null) return { ok: false, reason: 'no-dob' }   // → coach confirmation
  return age < YOUTH_MAX_AGE
    ? { ok: true, reason: 'youth', age }
    : { ok: false, reason: 'too-old', age }
}

export async function setPlayerBirthDate(playerId, birthDate) {
  const { error } = await supabase.rpc('set_player_birth_date', {
    p_player: playerId, p_birth: birthDate || null,
  })
  if (error) {
    const m = error.message || ''
    if (/in future/i.test(m)) throw new Error('תאריך הלידה לא יכול להיות עתידי')
    if (/too old/i.test(m)) throw new Error('תאריך הלידה לא תקין')
    if (/not authorized/i.test(m)) throw new Error('אין לך הרשאה לעדכן תאריך לידה')
    throw new Error('שמירת תאריך הלידה נכשלה')
  }
}

/** My own player card's DOB (null if I'm not linked to a player). */
export async function getMyBirthDate(playerId) {
  if (!playerId) return null
  const { data, error } = await supabase
    .from('players').select('birth_date').eq('id', playerId).maybeSingle()
  if (error) return null
  return data?.birth_date ?? null
}
