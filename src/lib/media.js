import { supabase } from './supabase'

// Face clusters surfaced on the Media page. Default: unidentified players.
export async function getMediaClusters({ status = 'unresolved' } = {}) {
  let q = supabase
    .from('face_clusters')
    .select('cluster_key, size, status, player_name, cover_url, source_detail_url, album_idx, albums, game_date')
    .order('size', { ascending: false })
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) throw error
  return data
}

// Per-cluster suggestion summary (count + most-suggested name).
export async function getSuggestionSummary() {
  const { data, error } = await supabase
    .from('cluster_suggestion_summary')
    .select('cluster_key, suggestion_count, top_name')
  if (error) throw error
  return Object.fromEntries((data || []).map(r => [r.cluster_key, r]))
}

// All suggestions for one cluster (names + when).
export async function getClusterSuggestions(clusterKey) {
  const { data, error } = await supabase
    .from('cluster_suggestions')
    .select('id, first_name, last_name, created_at')
    .eq('cluster_key', clusterKey)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

// Submit a name suggestion. Works logged-in or anonymously.
export async function submitSuggestion(clusterKey, firstName, lastName) {
  const first = (firstName || '').trim()
  const last = (lastName || '').trim()
  if (!first || !last) throw new Error('נא למלא שם פרטי ושם משפחה')
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('cluster_suggestions').insert({
    cluster_key: clusterKey,
    first_name: first,
    last_name: last,
    suggested_by: user?.id ?? null,
  })
  if (error) throw error
}

// Load the full photo index (photos + which recognized player is in each) for the
// auto-illustrated feed. Paged so it survives the PostgREST row cap.
async function fetchAll(table, select) {
  const out = []; let from = 0; const size = 1000
  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + size - 1)
    if (error) throw error
    out.push(...data)
    if (data.length < size) break
    from += size
  }
  return out
}

export async function getPhotoIndex() {
  const [photos, photoPlayers] = await Promise.all([
    fetchAll('photos', 'photo_id,album_idx,album_title,album_date,image_url,detail_url,n_faces'),
    fetchAll('photo_players', 'photo_id,player_id,name,box,face_h'),
  ])
  return { photos, photoPlayers }
}

// ---- Admin: review queue for name suggestions (shown in the "requests" tab) ----

// Unresolved clusters that have >=1 suggestion, with their suggested names tallied.
export async function getSuggestionQueue() {
  const { data: sugg, error } = await supabase
    .from('cluster_suggestions')
    .select('cluster_key, first_name, last_name')
  if (error) throw error
  if (!sugg?.length) return []
  const byCluster = {}
  for (const s of sugg) {
    const full = `${(s.first_name || '').trim()} ${(s.last_name || '').trim()}`.trim()
    const c = (byCluster[s.cluster_key] ||= { total: 0, names: {} })
    c.total++; c.names[full] = (c.names[full] || 0) + 1
  }
  const keys = Object.keys(byCluster)
  const { data: clusters, error: e2 } = await supabase
    .from('face_clusters')
    .select('cluster_key, size, status, cover_url, albums, game_date')
    .in('cluster_key', keys)
    .eq('status', 'unresolved')
  if (e2) throw e2
  return (clusters || []).map(c => ({
    ...c,
    total: byCluster[c.cluster_key].total,
    suggestions: Object.entries(byCluster[c.cluster_key].names)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
  })).sort((a, b) => (b.total - a.total) || (b.size - a.size))
}

// Approve: link the cluster to a roster player + mark resolved. The photo_players
// view is derived from this, so the feed picks it up immediately.
export async function resolveCluster(clusterKey, { playerId, playerName }) {
  const { error } = await supabase
    .from('face_clusters')
    .update({ player_id: playerId ?? null, player_name: playerName, status: 'resolved' })
    .eq('cluster_key', clusterKey)
  if (error) throw error
}

// Dismiss: hide the cluster (not a real/identifiable player) — leaves the queue & Media page.
export async function hideCluster(clusterKey) {
  const { error } = await supabase
    .from('face_clusters')
    .update({ status: 'hidden' })
    .eq('cluster_key', clusterKey)
  if (error) throw error
}

// Count of clusters already resolved (for the page header).
export async function getResolvedCount() {
  const { count, error } = await supabase
    .from('face_clusters')
    .select('cluster_key', { count: 'exact', head: true })
    .eq('status', 'resolved')
  if (error) throw error
  return count || 0
}
