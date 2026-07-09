import { supabase } from './supabase'

/**
 * "My account" page data + editing. Roles/admin come from AuthContext; this
 * only fetches the editable profile row, the linked player (if the account was
 * claimed + approved), and any pending player-ownership claim.
 *
 * Own file so the parallel sessions don't collide (same convention as
 * lib/claims.js / lib/reactions.js).
 */

/**
 * @returns {Promise<null | {user, profile, player, pendingClaim}>}
 *   null when signed out.
 */
export async function getMyProfile() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile, error } = await supabase
    .from('profiles').select('*').eq('id', user.id).maybeSingle()
  if (error) throw error

  let player = null
  if (profile?.player_id) {
    const { data: pl } = await supabase
      .from('players').select('*').eq('id', profile.player_id).maybeSingle()
    player = pl || null
  }

  const { data: claim } = await supabase
    .from('player_claims')
    .select('*, players(first_name, last_name)')
    .eq('profile_id', user.id)
    .eq('status', 'pending')
    .maybeSingle()

  return { user, profile: profile || null, player, pendingClaim: claim || null }
}

/**
 * Game photos in which a linked player was recognized (for the profile gallery).
 * photo_players is a view (no FK metadata), so we resolve ids then fetch photos.
 */
export async function getPlayerPhotos(playerId, limit = 30) {
  if (!playerId) return []
  const { data: pp, error } = await supabase
    .from('photo_players').select('photo_id').eq('player_id', playerId)
  if (error) throw error
  const ids = (pp || []).map(x => x.photo_id).slice(0, 150) // cap keeps the filter URL small
  if (!ids.length) return []
  const { data: photos, error: e2 } = await supabase
    .from('photos')
    .select('photo_id, image_url, detail_url, album_title, album_date')
    .in('photo_id', ids)
    .order('album_date', { ascending: false })
    .limit(limit)
  if (e2) throw e2
  return photos || []
}

/** Self-disconnect the account from its linked player (unlink + drop role + remove claim). */
export async function disconnectPairing() {
  const { error } = await supabase.rpc('disconnect_my_pairing')
  if (error) throw error
}

/**
 * Update the signed-in user's display name / avatar. Uses upsert so a missing
 * profiles row (older accounts) is created. Never touches player_id (guarded
 * at the DB for non-admins anyway).
 */
export async function updateMyProfile({ display_name, avatar_url }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('not authenticated')
  const row = { id: user.id }
  if (display_name !== undefined) row.display_name = display_name
  if (avatar_url !== undefined) row.avatar_url = avatar_url
  const { data, error } = await supabase
    .from('profiles')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single()
  if (error) throw error
  return data
}
