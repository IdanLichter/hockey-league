import { supabase } from './supabase'

/**
 * Admin role management (Stage B). Roles live in `user_roles` (player / coach /
 * content_editor / judge, optionally team-scoped) and are admin-managed by the
 * existing RLS ("Admin manages roles" FOR ALL; "Read own roles or admin"). No
 * migration needed. Kept out of api.js to avoid collision with other workstreams.
 */

export const ROLES = ['player', 'coach', 'content_editor', 'judge', 'league_manager']
// Roles the admin can grant from the Roles tab. Excludes 'player': players are
// defined in the Players tab and linked to an account via claim approval
// (which sets profiles.player_id) — inserting a bare 'player' user_roles row here
// does nothing. `ROLES` stays intact for label/badge lookups on existing rows.
export const GRANTABLE_ROLES = ROLES.filter(r => r !== 'player')
export const ROLE_LABEL = {
  player: 'שחקן',
  coach: 'מאמן',
  content_editor: 'עורך תוכן',
  judge: 'שופט',
  league_manager: 'מנהל ליגה',
}
// Roles that are scoped to a specific team.
export const TEAM_SCOPED = new Set(['coach', 'player'])

export async function getProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, player_id')
    .order('display_name')
  if (error) throw error
  return data
}

// Admin reads every row via RLS.
export async function getAllRoles() {
  const { data, error } = await supabase.from('user_roles').select('*')
  if (error) throw error
  return data
}

export async function grantRole(userId, role, teamId = null) {
  const { error } = await supabase
    .from('user_roles')
    .insert({ user_id: userId, role, team_id: TEAM_SCOPED.has(role) ? teamId : null })
  if (error) throw error
}

export async function revokeRole(id) {
  const { error } = await supabase.from('user_roles').delete().eq('id', id)
  if (error) throw error
}

/**
 * Permanently delete a user account (admin only) via the admin_delete_user RPC.
 * Frees the email (forcing re-signup) and cascades the profile + roles + posts +
 * comments + likes + pending claims/submissions. The linked player record
 * (stats/history) is preserved — only the account link is removed.
 */
export async function deleteUser(userId) {
  const { error } = await supabase.rpc('admin_delete_user', { p_user_id: userId })
  if (error) {
    if (/cannot delete yourself/i.test(error.message || '')) throw new Error('cannot-delete-self')
    if (/cannot delete an admin/i.test(error.message || '')) throw new Error('cannot-delete-admin')
    if (/not authorized/i.test(error.message || '')) throw new Error('not-authorized')
    throw error
  }
}
