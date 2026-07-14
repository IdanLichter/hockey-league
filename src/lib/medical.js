import { supabase } from './supabase'

/**
 * Medical certificates (#2). A linked player uploads a photo/PDF of their yearly
 * physical to the PRIVATE 'medical' Storage bucket (path "<player_id>/<file>"); a
 * pending medical_certificates row is created; the team's coach (or an admin) views
 * it via a short-lived signed URL and approves/rejects. Files are never public —
 * only the player, their coach, and admins can read them (storage RLS).
 */

/** Upload the player's physical to the private bucket + create a pending cert row. */
export async function uploadMedical(playerId, file) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('not-authenticated')
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase()
  const path = `${playerId}/${Date.now()}.${ext}`
  const { error: upErr } = await supabase.storage
    .from('medical')
    .upload(path, file, { upsert: false, contentType: file.type || undefined })
  if (upErr) throw upErr
  const { error: insErr } = await supabase
    .from('medical_certificates')
    .insert({ player_id: playerId, file_path: path, uploaded_by: user.id })
  if (insErr) {
    // roll back the orphaned upload; surface the "already pending" unique clash cleanly
    await supabase.storage.from('medical').remove([path]).catch(() => {})
    if (insErr.code === '23505') throw new Error('medical-already-pending')
    throw insErr
  }
}

/** The player's latest certificate (any status), or null. */
export async function getMyMedical(playerId) {
  if (!playerId) return null
  const { data, error } = await supabase
    .from('medical_certificates')
    .select('id,status,file_path,created_at,expires_at')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return null
  return data
}

/** Coach/admin: pending certificates joined to player + team (RLS scopes to their team). */
export async function getPendingMedical() {
  const { data, error } = await supabase
    .from('medical_certificates')
    .select('id,file_path,created_at,player_id,players(first_name,last_name,team_id,teams(name))')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

/** Approve/reject via the self-gated RPC (coach-of-team or admin). */
export async function reviewMedical(id, status) {
  const { error } = await supabase.rpc('review_medical_certificate', { p_id: id, p_status: status })
  if (error) {
    if (/not authorized/i.test(error.message || '')) throw new Error('not-authorized')
    throw error
  }
}

/** A short-lived signed URL to view a private medical file (120s). */
export async function signMedical(filePath) {
  const { data, error } = await supabase.storage.from('medical').createSignedUrl(filePath, 120)
  if (error) return null
  return data?.signedUrl ?? null
}
