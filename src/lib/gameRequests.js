import { supabase } from './supabase'

/**
 * Coach-requested game reschedules (date/time + venue), approved by a
 * league-manager / admin. Every write goes through a SECURITY DEFINER RPC (see
 * supabase/game-change-requests.sql); reads are RLS-scoped to the requester,
 * both teams' coaches, and managers/admins. Mirrors teamMembership.js.
 */

// Translate a raw Postgres/RPC error into a ready-to-show Hebrew message.
function requestError(e) {
  const code = e?.code
  const msg = String(e?.message || '')
  if (code === '23505' || /duplicate key|one_pending_per_game/i.test(msg))
    return new Error('כבר קיימת בקשת שינוי ממתינה למשחק זה')
  if (/only a coach/i.test(msg))            return new Error('רק מאמן של אחת הקבוצות יכול לבקש שינוי')
  if (/scheduled or postponed/i.test(msg))  return new Error('אפשר לבקש שינוי רק למשחק מתוכנן או שנדחה')
  if (/reason is required/i.test(msg))      return new Error('יש להזין סיבה לבקשה')
  if (/propose a new/i.test(msg))           return new Error('יש להציע תאריך/שעה או מגרש חדשים')
  if (/already (approved|rejected|cancelled)/i.test(msg)) return new Error('הבקשה כבר טופלה')
  if (/not authorized/i.test(msg))          return new Error('אין לך הרשאה לפעולה זו')
  return e instanceof Error ? e : new Error(msg || 'שגיאה')
}

// Coach submits. proposedDate = ISO string | null; proposedVenue = string | null.
export async function requestGameChange(gameId, { proposedDate, proposedVenue, reason }) {
  const { data, error } = await supabase.rpc('request_game_change', {
    p_game_id: gameId,
    p_proposed_date: proposedDate || null,
    p_proposed_venue: proposedVenue || null,
    p_reason: reason || null,
  })
  if (error) throw requestError(error)
  return data
}

// The current user's own latest request for a game (any status), or null.
export async function getMyGameChangeRequest(gameId) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('game_change_requests')
    .select('*')
    .eq('game_id', gameId)
    .eq('requested_by', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw error
  return data?.[0] || null
}

// Manager/admin queue: every pending request + its game and requester.
export async function getPendingGameChangeRequests() {
  const { data, error } = await supabase
    .from('game_change_requests')
    .select(
      '*, games(id, game_date, venue, status, home_team_id, away_team_id), ' +
      'requester:profiles!game_change_requests_requested_by_fkey(id, display_name, avatar_url)'
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function approveGameChange(id, note = null) {
  const { data, error } = await supabase.rpc('approve_game_change', { p_id: id, p_note: note || null })
  if (error) throw requestError(error)
  return data
}

export async function rejectGameChange(id, note = null) {
  const { data, error } = await supabase.rpc('reject_game_change', { p_id: id, p_note: note || null })
  if (error) throw requestError(error)
  return data
}

export async function cancelGameChangeRequest(id) {
  const { data, error } = await supabase.rpc('cancel_game_change_request', { p_id: id })
  if (error) throw requestError(error)
  return data
}

// Status → Hebrew label + tailwind chip classes (shared by the coach view).
export const GC_STATUS = {
  pending:   { label: 'ממתינה לאישור', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  approved:  { label: 'אושרה',        cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  rejected:  { label: 'נדחתה',        cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  cancelled: { label: 'בוטלה',        cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400' },
}
