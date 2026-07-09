import { supabase } from './supabase'

/**
 * Player-claim flow (Stage B1). A logged-in user files a PENDING claim on a
 * player record; an admin approves (links profiles.player_id + grants the
 * 'player' role) or rejects. Self-linking is blocked at the DB by
 * guard_profile_player_id(); only admins can set profiles.player_id.
 *
 * Lives in its own file (not api.js) so the two parallel sessions don't collide.
 */

// ----- claimant (player-page) side -----

/**
 * Everything the player page needs in one round-trip:
 *  - userId: current auth user id (null if signed out)
 *  - profile: the user's profiles row (has player_id if already linked)
 *  - pendingClaim: the user's open claim, if any (across all players)
 *  - playerOwnerId: profile id that already owns THIS player, or null
 */
export async function getClaimContext(playerId) {
  const { data: { user } } = await supabase.auth.getUser()

  const { data: owner, error: ownerErr } = await supabase
    .from('profiles').select('id').eq('player_id', playerId).maybeSingle()
  if (ownerErr) throw ownerErr

  let profile = null, pendingClaim = null
  if (user) {
    const [{ data: p, error: pErr }, { data: c, error: cErr }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('player_claims').select('*').eq('profile_id', user.id).eq('status', 'pending').maybeSingle(),
    ])
    if (pErr) throw pErr
    if (cErr) throw cErr
    profile = p; pendingClaim = c
  }

  return { userId: user?.id ?? null, profile, pendingClaim, playerOwnerId: owner?.id ?? null }
}

export async function createClaim(playerId, note) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('not-authenticated')
  const { data, error } = await supabase
    .from('player_claims')
    .insert({ profile_id: user.id, player_id: playerId, note: note || null })
    .select().single()
  if (error) throw error
  return data
}

export async function cancelClaim(claimId) {
  const { error } = await supabase.from('player_claims').delete().eq('id', claimId)
  if (error) throw error
}

// ----- admin review side -----

/** All pending claims, joined to the requested player and the claimant profile. */
export async function getPendingClaims() {
  const { data, error } = await supabase
    .from('player_claims')
    .select('*, players(*), profiles!player_claims_profile_id_fkey(id, display_name, avatar_url)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

/**
 * Approve a claim: link the profile → player, grant the team-scoped 'player'
 * role, and mark the claim approved. Runs as the logged-in admin (whose JWT
 * satisfies the profiles guard + user_roles admin policy). Throws a friendly
 * error if the player is already linked to another account.
 */
export async function approveClaim(claim) {
  const { data: { user } } = await supabase.auth.getUser()

  const { error: linkErr } = await supabase
    .from('profiles').update({ player_id: claim.player_id }).eq('id', claim.profile_id)
  if (linkErr) {
    if (linkErr.code === '23505') throw new Error('player-already-linked')
    throw linkErr
  }

  const teamId = claim.players?.team_id ?? null
  const { error: roleErr } = await supabase
    .from('user_roles')
    .upsert({ user_id: claim.profile_id, role: 'player', team_id: teamId },
            { onConflict: 'user_id,role,team_id', ignoreDuplicates: true })
  if (roleErr) throw roleErr

  const { error: claimErr } = await supabase
    .from('player_claims')
    .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: user?.id ?? null })
    .eq('id', claim.id)
  if (claimErr) throw claimErr
}

export async function rejectClaim(claimId) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('player_claims')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: user?.id ?? null })
    .eq('id', claimId)
  if (error) throw error
}
