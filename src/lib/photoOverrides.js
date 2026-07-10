import { supabase } from './supabase'

/**
 * Admin-curated photo choices for the synthetic feed cards (game result, milestone,
 * champion, top scorer). Each row's `item_key` equals the feed card's post.id — the
 * same key feed_item_likes / feed_item_comments use. `photo_id === null` means
 * "show no photo".
 *
 * RLS: public SELECT (the feed is public, so guests read overrides too); writes are
 * gated to admins. Lives in its own file so parallel sessions don't collide.
 */

// { [item_key]: photo_id }  (photo_id may be null → "no photo")
export async function getPhotoOverrides() {
  const { data, error } = await supabase
    .from('feed_photo_overrides')
    .select('item_key, photo_id')
  if (error) throw error
  return Object.fromEntries((data || []).map(r => [r.item_key, r.photo_id]))
}

// Pin `photoId` (or null for "no photo") to a card; upsert on the item_key primary key.
export async function setPhotoOverride(itemKey, photoId) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('feed_photo_overrides')
    .upsert(
      { item_key: itemKey, photo_id: photoId ?? null, set_by: user?.id ?? null, updated_at: new Date().toISOString() },
      { onConflict: 'item_key' }
    )
  if (error) throw error
}

// Remove the pin — the card reverts to the automatic pick.
export async function clearPhotoOverride(itemKey) {
  const { error } = await supabase
    .from('feed_photo_overrides')
    .delete()
    .eq('item_key', itemKey)
  if (error) throw error
}
