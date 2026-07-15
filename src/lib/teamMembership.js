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

export async function requestTeamJoin(teamId, note = null) {
  const { data, error } = await supabase.rpc('request_team_join', { p_team_id: teamId, p_note: note || null })
  if (error) {
    if (error.code === '23505') throw new Error('join-already-pending')
    if (/not a linked player/i.test(error.message || '')) throw new Error('not-linked-player')
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
