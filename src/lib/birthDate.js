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

/**
 * Can this player be borrowed by another team? Under 18, or a goalkeeper of any age.
 *
 * Judges on an AGE, taking either `age_years` or a `birth_date` — the squad picker now
 * only ever holds the age (see getPlayerLoanAges), while a caller that legitimately has
 * the date can still pass it. 'no-dob' keeps its name: to the coach it is still "no date
 * of birth on file", whichever field was missing.
 */
export function canBeBorrowed(player) {
  if (!player) return { ok: false, reason: 'unknown' }
  if (player.position === 'Goalkeeper') return { ok: true, reason: 'goalkeeper' }
  const age = player.age_years ?? ageFromBirthDate(player.birth_date)
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

/**
 * One player's DOB — for the people entitled to EDIT it: the owner, his coach, a manager.
 *
 * Goes through player_birth_date() rather than reading the column, because the column is
 * granted to no PostgREST role: `players` is world-readable by policy (`using (true)`),
 * so a column grant to `authenticated` meant every signed-up account could read all 26
 * dates on file, 4 of them minors'. The RPC carries the same authorization as
 * set_player_birth_date — if you may write it, you may read it back.
 *
 * Returns null both when there is no date and when the caller is not entitled to it;
 * every caller already renders "unknown" the same way, and the distinction is not one we
 * want to hand out.
 */
export async function getPlayerBirthDate(playerId) {
  if (!playerId) return null
  const { data, error } = await supabase.rpc('player_birth_date', { p_player: playerId })
  if (error) return null
  return data ?? null
}

/**
 * Loan eligibility across the league, as playerId → age in whole years (or null).
 *
 * AGES, not dates. The squad picker has only ever rendered "בן/בת 16" and compared
 * against 18 — it never needed the date itself, and an exact date of birth is far more
 * identifying than an age for the 15-year-old it is usually about. So the server derives
 * the year count and the dates never leave it.
 *
 * Gated to the people who run games — coaches, judges, managers — because they are the
 * ones the loan rule is addressed to. Everyone else gets {}, which reads as "unknown",
 * and unknown already has a defined meaning here: the coach vouches with the checkbox.
 *
 * One request rather than a round trip per card; the picker judges all ~100 at once.
 */
export async function getPlayerLoanAges() {
  const { data, error } = await supabase.rpc('squad_loan_ages')
  if (error) return {}
  return Object.fromEntries((data || []).map(r => [r.player_id, r.age_years ?? null]))
}

/** My own player card's DOB (null if I'm not linked to a player). */
export const getMyBirthDate = getPlayerBirthDate
