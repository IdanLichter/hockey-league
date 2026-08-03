import { supabase } from './supabase'

/**
 * Self-service team membership (Package 1b). A linked player requests to join a
 * team (request_team_join) → the team's coach or an admin approves
 * (approve_team_join), which sets players.team_id and refreshes the team-scoped
 * 'player' role. leave_team() makes the player a free agent (team_id null).
 * Mirrors the claim/submission flows.
 */

// ----- player side -----

/** The current user's open (pending) join request, if any (joined to its team). */
export async function getMyJoinRequest() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('team_join_requests')
    .select('*, teams(id, name, logo_url)')
    .eq('profile_id', user.id).eq('status', 'pending')
    .maybeSingle()
  if (error) throw error
  return data
}

/** The linked player's current team memberships (team + age group) for the multi-age card. */
export async function getMyMemberships(playerId) {
  if (!playerId) return []
  const { data, error } = await supabase
    .from('player_teams')
    .select('team_id, age_group, teams(id, name, logo_url, primary_color, age_group)')
    .eq('player_id', playerId)
  if (error) throw error
  return data || []
}

/** Hebrew for every way a join request can be refused. */
export const JOIN_ERRORS = {
  'join-already-pending': 'כבר יש לך בקשת הצטרפות ממתינה',
  'pending-in-age-group': 'כבר יש לך בקשה ממתינה לקבוצה בקבוצת הגיל הזו',
  'already-on-team':      'את/ה כבר בקבוצה הזו',
  'already-in-age-group': 'את/ה כבר משוייך/ת לקבוצה בקבוצת הגיל הזו — יש לעזוב אותה תחילה',
  'not-linked-player':    'רק שחקן/ית מקושר/ת לכרטיס שחקן יכול/ה לבקש הצטרפות',
}
export const joinErrorText = (e) => JOIN_ERRORS[e?.message] || 'שגיאה בשליחת הבקשה'

export async function requestTeamJoin(teamId, note = null) {
  const { data, error } = await supabase.rpc('request_team_join', { p_team_id: teamId, p_note: note || null })
  if (error) {
    const msg = error.message || ''
    if (error.code === '23505') throw new Error('join-already-pending')
    if (/not a linked player/i.test(msg)) throw new Error('not-linked-player')
    // One team per age group. Enforced at request time now — asking to join a second
    // senior team used to queue fine and then silently TRANSFER the player on approval.
    if (/already on this team/i.test(msg)) throw new Error('already-on-team')
    if (/already in age group/i.test(msg)) throw new Error('already-in-age-group')
    if (/pending in age group/i.test(msg)) throw new Error('pending-in-age-group')
    throw error
  }
  return data
}

export async function cancelTeamJoin(id) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('not-authenticated')
  const { data, error } = await supabase
    .from('team_join_requests').delete()
    .eq('id', id).eq('profile_id', user.id).eq('status', 'pending').select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('join-not-cancelable')
}

/** Become a free agent (players.team_id → null). */
export async function leaveTeam() {
  const { error } = await supabase.rpc('leave_team')
  if (error) throw error
}

/** Leave one specific team (multi-age aware — keeps memberships in other age groups). */
export async function leaveTeamById(teamId) {
  const { error } = await supabase.rpc('leave_team_by_id', { p_team_id: teamId })
  if (error) throw error
}

// ----- reviewer (coach / admin) side -----

export async function getPendingTeamJoins() {
  const { data, error } = await supabase
    .from('team_join_requests')
    .select('*, teams(id, name, logo_url), players(id, first_name, last_name, jersey_number, position), profiles!team_join_requests_profile_id_fkey(id, display_name, avatar_url)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function approveTeamJoin(id) {
  const { error } = await supabase.rpc('approve_team_join', { p_request_id: id })
  if (error) {
    if (/not authorized/i.test(error.message || '')) throw new Error('not-authorized')
    throw error
  }
}

export async function rejectTeamJoin(id) {
  const { error } = await supabase.rpc('reject_team_join', { p_request_id: id })
  if (error) {
    if (/not authorized/i.test(error.message || '')) throw new Error('not-authorized')
    throw error
  }
}
