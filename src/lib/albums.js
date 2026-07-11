import { supabase } from './supabase'

// Album submissions — content editors (and admins) drop a Google-Photos album
// URL into a queue that's processed OFFLINE (scrape → face-cluster → new photo
// groups). Not instant. The `album_submissions` table + RLS already exist in
// prod: editors+admins insert-as-self / read / update.
//   cols: id, url, source, note, status (pending|processing|done|rejected),
//         submitted_by, reviewed_by, created_at, updated_at

// Recognizes a Google Photos share link (long form + goo.gl short link) so the
// submission is tagged source='google_photos'; anything else stores source=null.
const GOOGLE_PHOTOS_RE = /^https?:\/\/(photos\.google\.com|photos\.app\.goo\.gl)\//i

async function currentUserId() {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id || null
}

// Queue a new album for processing. Requires a signed-in editor/admin (RLS is the
// real gate; submitted_by must equal auth.uid()).
export async function submitAlbum({ url, note = null }) {
  const me = await currentUserId()
  if (!me) throw new Error('יש להתחבר')
  const trimmed = (url || '').trim()
  if (!trimmed) throw new Error('נא להזין כתובת אלבום')
  const source = GOOGLE_PHOTOS_RE.test(trimmed) ? 'google_photos' : null
  const { data, error } = await supabase
    .from('album_submissions')
    .insert({
      url: trimmed,
      source,
      note: note ? String(note).trim() : null,
      submitted_by: me,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// All submissions, newest first.
export async function getAlbumSubmissions() {
  const { data, error } = await supabase
    .from('album_submissions')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

// Move a submission through the pipeline (pending → processing → done / rejected).
export async function updateAlbumStatus(id, status) {
  if (!['pending', 'processing', 'done', 'rejected'].includes(status)) {
    throw new Error(`bad status: ${status}`)
  }
  const { error } = await supabase
    .from('album_submissions')
    .update({ status })
    .eq('id', id)
  if (error) throw error
}
