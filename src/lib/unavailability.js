import { supabase } from './supabase'

/**
 * Player availability constraints — injury, abroad, reserve duty.
 *
 * The mirror image of a suspension: a red card says "you may not play", this says
 * "I cannot play". Same shape (a row, a predicate, the registration gates consult
 * both), and the difference is who starts it — a player self-reports and waits at
 * 'pending' for his coach, while a coach or manager filing one IS the decision and it
 * lands 'approved' straight away. See supabase/player-unavailability.sql.
 *
 * Every write is an RPC: the table grants `authenticated` SELECT only.
 */

export const UNAVAILABILITY_KINDS = [
  { value: 'injury', label: 'פציעה' },
  { value: 'abroad', label: 'שהות בחו״ל' },
  { value: 'reserve_duty', label: 'מילואים' },
  { value: 'other', label: 'סיבה אחרת' },
]
export const KIND_LABEL = Object.fromEntries(UNAVAILABILITY_KINDS.map(k => [k.value, k.label]))

/**
 * Everything the caller is allowed to see. RLS does the scoping for us — a coach gets
 * his own squad (across every age group he coaches), a player his own rows, an admin or
 * league manager the lot — so there is no client-side filter to keep in sync with it.
 */
export async function getUnavailability() {
  const { data, error } = await supabase
    .from('player_unavailability')
    // The FK is pinned even though there is only one to players today: an added FK is
    // exactly what turned a bare embed into a PGRST201 the last time (embed-ambiguity).
    .select('id, player_id, kind, starts_on, ends_on, reason, status, created_by, ' +
            'approved_by, created_at, decided_at, decision_note, ' +
            'players!player_unavailability_player_id_fkey(first_name, last_name, team_id)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(r => ({
    ...r,
    first_name: r.players?.first_name || '',
    last_name: r.players?.last_name || '',
    team_id: r.players?.team_id || null,
  }))
}

/** File an absence. A coach/manager filing one approves it in the same breath. */
export async function reportUnavailability({ playerId = null, kind, startsOn, endsOn = null, reason = null }) {
  const { data, error } = await supabase.rpc('report_unavailability', {
    p_kind: kind, p_starts_on: startsOn, p_ends_on: endsOn || null,
    p_reason: reason || null, p_player: playerId,
  })
  if (error) {
    const m = error.message || ''
    if (/not authorized/i.test(m)) throw new Error('אין לך הרשאה לדווח על היעדרות עבור שחקן זה')
    if (/no linked player/i.test(m)) throw new Error('החשבון אינו משויך לכרטיס שחקן')
    if (/player not found/i.test(m)) throw new Error('השחקן לא נמצא')
    if (/end before start/i.test(m)) throw new Error('תאריך הסיום מוקדם מתאריך ההתחלה')
    if (/start date required/i.test(m)) throw new Error('יש לבחור תאריך התחלה')
    throw new Error('הדיווח נכשל')
  }
  return data
}

/** Rule on a player's self-report. */
export async function decideUnavailability(id, approve, note = null) {
  const { error } = await supabase.rpc('decide_unavailability', {
    p_id: id, p_approve: approve, p_note: note || null,
  })
  if (error) {
    const m = error.message || ''
    if (/not authorized/i.test(m)) throw new Error('אין לך הרשאה להחליט על היעדרות זו')
    if (/already decided/i.test(m)) throw new Error('ההיעדרות כבר טופלה — רענן/י את הרשימה')
    if (/not found/i.test(m)) throw new Error('ההיעדרות לא נמצאה')
    throw new Error('שמירת ההחלטה נכשלה')
  }
}

/**
 * End an absence early, or retract one. An absence already under way is closed by
 * moving its end date to yesterday; one that has not begun never took effect, so
 * retracting it is recorded as a rejection.
 */
export async function clearUnavailability(id, note = null) {
  const { error } = await supabase.rpc('clear_unavailability', { p_id: id, p_note: note || null })
  if (error) {
    const m = error.message || ''
    if (/not authorized/i.test(m)) throw new Error('אין לך הרשאה לסיים היעדרות זו')
    if (/already cleared/i.test(m)) throw new Error('ההיעדרות כבר בוטלה')
    if (/not found/i.test(m)) throw new Error('ההיעדרות לא נמצאה')
    throw new Error('סיום ההיעדרות נכשל')
  }
}

/** Today (local) as yyyy-mm-dd — the same shape the date columns hold. */
export const todayISO = () => new Date().toLocaleDateString('en-CA')

/**
 * How a row reads on screen. 'pending' is waiting on a decision; an approved row is
 * active now, still ahead, or already over; 'rejected' covers both a refusal and a
 * retraction (the status vocabulary has no separate "cleared").
 */
export function unavailabilityState(row, on = todayISO()) {
  if (row.status === 'pending') return 'pending'
  if (row.status === 'rejected') return 'rejected'
  if (row.starts_on > on) return 'upcoming'
  if (row.ends_on && row.ends_on < on) return 'ended'
  return 'active'
}

/** The Hebrew label for a kind, falling back to the generic word rather than the raw
 *  enum — an unrecognised kind must still read as Hebrew on a game page. */
export const kindLabel = (kind) => KIND_LABEL[kind] || 'היעדרות'

/**
 * The day a game is played, as yyyy-mm-dd.
 *
 * The game-day surfaces have to ask their questions on the GAME's date, not today's:
 * both server gates call is_unavailable(player, game_date::date), so an absence ending on
 * Thursday blocks Wednesday's fixture and not Saturday's.
 */
export function gameDayOf(game) {
  if (!game?.game_date) return todayISO()
  const d = new Date(game.game_date)
  return isNaN(d) ? todayISO() : d.toLocaleDateString('en-CA')
}

/** Does this row actually block registration on `day`? Mirrors is_unavailable(): an
 *  approved row only — a pending self-report must never lock a player out before
 *  anyone has looked at it. */
export const activeOn = (row, day = todayISO()) =>
  !!row && row.status === 'approved' && unavailabilityState(row, day) === 'active'

/** 2026-09-20 → 20.9.2026, from the string itself: putting a date-only value through
 *  Date() is how it ends up rendered as the day before in a negative-offset timezone. */
export function formatDay(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).split('-')
  return `${Number(d)}.${Number(m)}.${y}`
}

/** The span as ONE left-to-right run — two separate LTR runs on an RTL line get
 *  reordered by bidi and show the end date first. `open` = no end date on file. */
export function absenceRange(row) {
  if (!row) return { range: '', open: true }
  return row.ends_on
    ? { range: `${formatDay(row.starts_on)} – ${formatDay(row.ends_on)}`, open: false }
    : { range: formatDay(row.starts_on), open: true }
}

/** One line of plain text for the WhatsApp squad export, where there is no dir="ltr"
 *  to lean on and every extra word costs a line on a phone. */
export function absenceText(row) {
  if (!row) return ''
  return row.ends_on
    ? `${kindLabel(row.kind)} עד ${formatDay(row.ends_on)}`
    : `${kindLabel(row.kind)} (ללא תאריך סיום)`
}

/**
 * Pending + approved rows for a known set of players.
 *
 * Distinct from getUnavailability() above, which fetches everything the caller may see
 * for the management table: a game page knows exactly which squad it is drawing, and it
 * must not break when a row is unreadable — an absence nobody may see has to degrade to
 * "nothing known", never to a panel that fails to render. Rejected rows are left out;
 * they are history, and no game-day surface acts on them.
 */
export async function getUnavailabilityFor(playerIds) {
  const ids = [...new Set((playerIds || []).filter(Boolean))]
  if (!ids.length) return []
  const { data, error } = await supabase
    .from('player_unavailability')
    .select('id, player_id, kind, starts_on, ends_on, reason, status, decision_note, created_at')
    .in('player_id', ids)
    .in('status', ['pending', 'approved'])
    .order('created_at', { ascending: false })
  if (error) return []
  return data || []
}
