import { supabase } from './supabase'

/**
 * Officials (judges + medics) assignment, self-submission, and pay (epic D).
 * All writes go through SECURITY DEFINER RPCs gated to admin/league-manager (assign,
 * review, rates) or the official themselves (apply). League managers can't read
 * user_roles / game_officials broadly, so the read helpers are definer RPCs too.
 */

export const OFFICIAL_ROLES = ['judge', 'medic']
export const OFFICIAL_ROLE_LABEL = { judge: 'שופט', medic: 'חובש' }

// ---- reads (admin/LM) ----
export async function listAssignableOfficials() {
  const { data, error } = await supabase.rpc('list_assignable_officials')
  if (error) throw error
  return data || []
}

export async function getOfficialsOverview() {
  const { data, error } = await supabase.rpc('game_officials_overview')
  if (error) throw error
  return data || []
}

export async function getOfficialRates() {
  const { data, error } = await supabase.from('official_rates').select('role,rate')
  if (error) return { judge: 0, medic: 0 }
  return Object.fromEntries((data || []).map(r => [r.role, Number(r.rate) || 0]))
}

export async function getOfficialsPaylog() {
  const { data, error } = await supabase.rpc('officials_paylog')
  if (error) throw error
  return data || []
}

// ---- writes ----
export async function assignOfficial(gameId, userId, role) {
  const { error } = await supabase.rpc('assign_official', { p_game_id: gameId, p_user_id: userId, p_role: role })
  if (error) throw error
}

export async function removeOfficial(id) {
  const { error } = await supabase.rpc('remove_official', { p_id: id })
  if (error) throw error
}

export async function setOfficialRate(role, rate) {
  const { error } = await supabase.rpc('set_official_rate', { p_role: role, p_rate: Number(rate) || 0 })
  if (error) throw error
}

export async function reviewOfficialApplication(id, approve) {
  const { error } = await supabase.rpc('review_official_application', { p_id: id, p_approve: approve })
  if (error) throw error
}

// ---- self-submit (a judge/medic applies to work a game) ----
export async function applyAsOfficial(gameId, role) {
  const { error } = await supabase.rpc('apply_as_official', { p_game_id: gameId, p_role: role })
  if (error) {
    if (/not authorized/i.test(error.message || '')) throw new Error('not-authorized')
    throw error
  }
}

/** My own official assignments/applications for a game (self-readable via RLS). */
export async function getMyOfficialRoles(gameId) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !gameId) return []
  const { data, error } = await supabase
    .from('game_officials')
    .select('id,role,status')
    .eq('game_id', gameId)
    .eq('user_id', user.id)
  if (error) return []
  return data || []
}
