import { supabase } from './supabase'

/**
 * "Request to coach a team" flow. A linked player files a PENDING request for a
 * specific team; an admin or league-manager approves (which grants the team-scoped
 * 'coach' role via user_roles) or rejects. Mirrors the player-claim flow — inserts
 * and the review go through SECURITY DEFINER RPCs; the requester reads/cancels own
 * rows directly via RLS.
 */

// ----- requester (team-page) side -----

export async function requestCoachRole(teamId, note = null) {
  const { data, error } = await supabase.rpc('request_coach_role', { p_team_id: teamId, p_note: note || null })
  if (error) {
    if (/already a coach/i.test(error.message || '')) throw new Error('already-coach')
    if (/already-pending/i.test(error.message || '')) throw new Error('coach-request-already-pending')
    if (/linked player/i.test(error.message || '')) throw new Error('not-a-linked-player')
    if (/team not found/i.test(error.message || '')) throw new Error('team-not-found')
    throw error
  }
  return data
}

/** The user's own open request for a team, if any (for the button's pending state). */
export async function getMyCoachRequest(teamId) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !teamId) return null
  const { data, error } = await supabase
    .from('coach_requests')
    .select('id, status, team_id')
    .eq('profile_id', user.id).eq('team_id', teamId).eq('status', 'pending')
    .maybeSingle()
  if (error) return null
  return data
}

export async function cancelCoachRequest(id) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('not-authenticated')
  // Mirror the DELETE RLS (own + pending) and read back so we can tell the caller
  // when nothing matched (e.g. it was already approved/rejected).
  const { data, error } = await supabase
    .from('coach_requests')
    .delete()
    .eq('id', id).eq('profile_id', user.id).eq('status', 'pending')
    .select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('not-cancelable')
}

// ----- admin / league-manager review side -----

/** All pending coach requests (admin/LM only, via the gated RPC). */
export async function getPendingCoachRequests() {
  const { data, error } = await supabase.rpc('pending_coach_requests')
  if (error) {
    if (/not authorized/i.test(error.message || '')) return []
    throw error
  }
  return data || []
}

export async function reviewCoachRequest(id, approve) {
  const { error } = await supabase.rpc('review_coach_request', { p_id: id, p_approve: approve })
  if (error) {
    if (/not authorized/i.test(error.message || '')) throw new Error('not-authorized')
    throw error
  }
}
