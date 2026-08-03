import { supabase } from './supabase'

/**
 * Follow / subscribe (P5 — sheet row 24 + the ranked-feed epic).
 *
 * One table serves two jobs, which is why `notify` is a separate flag on each row:
 * following a team floats it up your feed, but you only get pushed about its games if
 * you asked to be. Following is cheap; notifications are annoying. Targets are teams
 * and players.
 *
 * Reads are RLS-scoped to your own rows — a follow list is nobody else's business —
 * so public follower COUNTS come from the follower_counts definer RPC instead.
 */

export const FOLLOW_TYPES = { team: 'team', player: 'player' }

/** Everything I follow: [{ target_type, target_id, notify }]. */
export async function getMyFollows() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('follows')
    .select('target_type,target_id,notify')
    .eq('user_id', user.id)
  if (error) return []
  return data || []
}

/**
 * My follows as two Sets, which is the shape the feed ranker wants.
 * Returns { teams:Set, players:Set, notify:Set<`${type}:${id}`> }.
 */
export async function getMyFollowSets() {
  const rows = await getMyFollows()
  return {
    teams: new Set(rows.filter(r => r.target_type === 'team').map(r => r.target_id)),
    players: new Set(rows.filter(r => r.target_type === 'player').map(r => r.target_id)),
    notify: new Set(rows.filter(r => r.notify).map(r => `${r.target_type}:${r.target_id}`)),
  }
}

/** Follow a target. `notify` defaults to off — opting into pushes is a separate act. */
export async function follow(targetType, targetId, notify = false) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('not-authenticated')
  const { error } = await supabase
    .from('follows')
    .upsert({ user_id: user.id, target_type: targetType, target_id: targetId, notify },
            { onConflict: 'user_id,target_type,target_id' })
  if (error) throw error
}

export async function unfollow(targetType, targetId) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('not-authenticated')
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('user_id', user.id)
    .eq('target_type', targetType)
    .eq('target_id', targetId)
  if (error) throw error
}

/** Turn pushes on/off for something already followed. */
export async function setFollowNotify(targetType, targetId, notify) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('not-authenticated')
  const { error } = await supabase
    .from('follows')
    .update({ notify })
    .eq('user_id', user.id)
    .eq('target_type', targetType)
    .eq('target_id', targetId)
  if (error) throw error
}

/** Follower counts for a set of targets → { [id]: n }. Counts only, never who. */
export async function getFollowerCounts(targetType, ids) {
  const list = (ids || []).filter(Boolean)
  if (!list.length) return {}
  const { data, error } = await supabase.rpc('follower_counts', {
    p_type: targetType, p_ids: list,
  })
  if (error) return {}
  return Object.fromEntries((data || []).map(r => [r.target_id, Number(r.followers) || 0]))
}
