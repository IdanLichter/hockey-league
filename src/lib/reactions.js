import { supabase } from './supabase'

/**
 * Likes + comments for SYNTHETIC feed items (game results, milestones,
 * champion, top-scorer) that have no row in `posts`. Everything is keyed by the
 * feed item's stable string id (post.id from lib/feed.js), e.g.:
 *   'game-<uuid>', 'ms-<uuid>-p<uuid>', 'champion', 'top-scorer'.
 *
 * Human posts keep using api.js (post_likes/comments); this is the parallel
 * layer for the derived cards. Lives in its own file so the parallel sessions
 * don't collide (same convention as lib/claims.js).
 */

async function currentUserId() {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

/**
 * One round-trip for the whole feed: returns like counts per item and the set
 * of item keys the signed-in user has liked.
 * @returns {Promise<{counts: Object, mine: Set<string>}>}
 */
export async function getItemLikes() {
  const [{ data, error }, me] = await Promise.all([
    supabase.from('feed_item_likes').select('item_key, user_id'),
    currentUserId(),
  ])
  if (error) throw error
  const counts = {}
  const mine = new Set()
  for (const r of data || []) {
    counts[r.item_key] = (counts[r.item_key] || 0) + 1
    if (me && r.user_id === me) mine.add(r.item_key)
  }
  return { counts, mine }
}

/** Comment counts per item key (non-deleted), for the whole feed in one query. */
export async function getItemCommentCounts() {
  const { data, error } = await supabase
    .from('feed_item_comments')
    .select('item_key')
    .is('deleted_at', null)
  if (error) throw error
  const counts = {}
  for (const r of data || []) counts[r.item_key] = (counts[r.item_key] || 0) + 1
  return counts
}

export async function likeItem(itemKey) {
  const me = await currentUserId()
  if (!me) throw new Error('not authenticated')
  const { error } = await supabase.from('feed_item_likes').insert({ item_key: itemKey, user_id: me })
  if (error) throw error
}

export async function unlikeItem(itemKey) {
  const me = await currentUserId()
  if (!me) throw new Error('not authenticated')
  const { error } = await supabase.from('feed_item_likes').delete().eq('item_key', itemKey).eq('user_id', me)
  if (error) throw error
}

export async function getItemComments(itemKey) {
  const { data, error } = await supabase
    .from('feed_item_comments')
    .select('*, author:profiles!feed_item_comments_author_id_fkey(display_name, avatar_url, player_id)')
    .eq('item_key', itemKey)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function createItemComment(itemKey, body) {
  const me = await currentUserId()
  if (!me) throw new Error('not authenticated')
  const { data, error } = await supabase
    .from('feed_item_comments')
    .insert({ item_key: itemKey, author_id: me, body: body.trim() })
    .select('*, author:profiles!feed_item_comments_author_id_fkey(display_name, avatar_url, player_id)')
    .single()
  if (error) throw error
  return data
}

export async function editItemComment(id, body) {
  // feed_item_comments.body CHECK: 1..1000 chars. No updated_at column → set body only.
  const trimmed = (body || '').trim().slice(0, 1000)
  if (!trimmed) throw new Error('empty body')
  const { error } = await supabase.from('feed_item_comments').update({ body: trimmed }).eq('id', id)
  if (error) throw error
}

export async function deleteItemComment(id) {
  // soft delete, consistent with deletePost/deleteComment
  const { error } = await supabase.from('feed_item_comments').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}
