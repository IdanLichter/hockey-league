import { supabase } from './supabase'
import { ROLE_LABEL } from './roles'

/**
 * In-app notifications ("bell"). Rows are written server-side only (SECURITY
 * DEFINER triggers — see supabase/notifications-schema.sql); the client just
 * reads / marks-read / dismisses its own. Actor profiles are resolved with a
 * separate lookup (never a PostgREST embed — see the embed-ambiguity gotcha).
 *
 * Queries mirror the RLS predicate (`user_id = auth.uid()`) explicitly rather
 * than leaning on it silently.
 */

async function currentUserId() {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id || null
}

export async function getNotifications(limit = 30) {
  const me = await currentUserId()
  if (!me) return []
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', me)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  const rows = data || []

  const actorIds = [...new Set(rows.map(r => r.actor_id).filter(Boolean))]
  let profiles = {}
  if (actorIds.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, player_id')
      .in('id', actorIds)
    profiles = Object.fromEntries((profs || []).map(p => [p.id, p]))
  }
  return rows.map(r => ({ ...r, actor: r.actor_id ? profiles[r.actor_id] || null : null }))
}

export async function getUnreadCount() {
  const me = await currentUserId()
  if (!me) return 0
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', me)
    .is('read_at', null)
  if (error) return 0
  return count || 0
}

export async function markAllRead() {
  const me = await currentUserId()
  if (!me) return
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', me)
    .is('read_at', null)
  if (error) throw error
}

export async function markRead(id) {
  const me = await currentUserId()
  if (!me) return
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', me)
  if (error) throw error
}

// Live badge: invoke cb on every new notification for this user. Returns an
// unsubscribe fn. No-op-safe if Realtime isn't reachable (the bell also
// refreshes on window focus as a fallback).
export function subscribeToNotifications(userId, cb) {
  if (!userId) return () => {}
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => cb(payload.new),
    )
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}

// ---- presentation --------------------------------------------------------

const actorName = (n) => n.actor?.display_name?.trim() || 'מישהו'

// Hebrew one-liner for a notification row.
export function notificationText(n) {
  const d = n.data || {}
  switch (n.type) {
    case 'post_like':      return `${actorName(n)} אהב/ה את הפוסט שלך`
    case 'post_comment':   return `${actorName(n)} הגיב/ה על הפוסט שלך`
    case 'claim_approved': return `הבקשה שלך להתחבר לשחקן ${d.player_name || ''} אושרה 🎉`
    case 'claim_rejected': return `הבקשה שלך להתחבר לשחקן ${d.player_name || ''} נדחתה`
    case 'role_granted':   return `קיבלת תפקיד: ${ROLE_LABEL[d.role] || d.role || ''}`
    case 'claim_request':  return `${d.claimant || 'משתמש'} מבקש/ת להתחבר לשחקן ${d.player_name || ''}`
    case 'content_report': return `דווח תוכן${d.reason ? ` — ${d.reason}` : ''}`
    case 'game_result':    return `תוצאה: ${d.home_team || ''} ${d.home_score ?? ''}:${d.away_score ?? ''} ${d.away_team || ''}`
    case 'game_change_request':  return `${actorName(n)} מבקש/ת שינוי במשחק ${d.home_team || ''} נגד ${d.away_team || ''}${d.reason ? ` — ${d.reason}` : ''}`
    case 'game_change_approved': return `בקשתך לשינוי המשחק ${d.home_team || ''} נגד ${d.away_team || ''} אושרה 🎉${d.decision_note ? ` — ${d.decision_note}` : ''}`
    case 'game_change_rejected': return `בקשתך לשינוי המשחק ${d.home_team || ''} נגד ${d.away_team || ''} נדחתה${d.decision_note ? ` — ${d.decision_note}` : ''}`
    default:               return 'התראה חדשה'
  }
}

// Emoji glyph per type (the bell keeps the actor avatar when there is one).
export function notificationIcon(n) {
  switch (n.type) {
    case 'post_like':      return '❤️'
    case 'post_comment':   return '💬'
    case 'claim_approved': return '✅'
    case 'claim_rejected': return '⛔'
    case 'role_granted':   return '🎖️'
    case 'claim_request':  return '🙋'
    case 'content_report': return '🚩'
    case 'game_result':    return '⚽'
    case 'game_change_request':  return '🗓️'
    case 'game_change_approved': return '✅'
    case 'game_change_rejected': return '⛔'
    default:               return '🔔'
  }
}

// Where clicking the notification takes you.
export function notificationHref(n) {
  switch (n.type) {
    case 'claim_approved':
    case 'claim_rejected': return n.entity_id ? `/players/${n.entity_id}` : '/me'
    case 'role_granted':   return '/me'
    case 'claim_request':
    case 'content_report': return '/admin'
    case 'game_change_request':  return '/admin'
    case 'game_result':
    case 'game_change_approved':
    case 'game_change_rejected':  return n.entity_id ? `/games/${n.entity_id}` : '/games'
    case 'post_like':
    case 'post_comment':
    default:               return '/'
  }
}
