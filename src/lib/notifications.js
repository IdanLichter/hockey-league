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
    case 'game_change_opponent': return `${actorName(n)} מבקש/ת שינוי מועד — יש לבחור מועד שמתאים לך${d.reason ? ` (${d.reason})` : ''}`
    case 'game_change_approved': return `בקשתך לשינוי המשחק ${d.home_team || ''} נגד ${d.away_team || ''} אושרה 🎉${d.decision_note ? ` — ${d.decision_note}` : ''}`
    case 'game_change_rejected': return `בקשתך לשינוי המשחק ${d.home_team || ''} נגד ${d.away_team || ''} נדחתה${d.decision_note ? ` — ${d.decision_note}` : ''}`
    case 'team_join_request':    return `${actorName(n)} מבקש/ת להצטרף לקבוצת ${d.team_name || ''}`
    case 'team_join_approved':   return `בקשתך להצטרף לקבוצת ${d.team_name || ''} אושרה 🎉`
    case 'team_join_rejected':   return `בקשתך להצטרף לקבוצת ${d.team_name || ''} נדחתה`
    case 'player_submission_request':  return `${actorName(n)} הגיש/ה כרטיס שחקן חדש${d.candidate_name ? `: ${d.candidate_name}` : ''}${d.team_name ? ` — ${d.team_name}` : ''}`
    case 'player_submission_approved': return `כרטיס השחקן ${d.candidate_name || ''} שהגשת אושר 🎉`
    case 'player_submission_rejected': return `כרטיס השחקן ${d.candidate_name || ''} שהגשת נדחה`
    case 'medical_submitted':    return `${d.player_name || actorName(n)} העלה/תה אישור רפואי הממתין לאישור`
    case 'medical_approved':     return `האישור הרפואי שלך אושר ✅`
    case 'medical_rejected':     return `האישור הרפואי שלך נדחה — יש להעלות מחדש`
    case 'medical_expiring':     return `האישור הרפואי שלך יפוג בעוד ${d.days_left ?? ''} ימים — מומלץ לחדש`
    case 'tournament_invite':          return `קבוצת ${d.team_name || ''} הוזמנה לטורניר ${d.tournament_name || ''}`
    case 'tournament_invite_accepted': return `קבוצת ${d.team_name || ''} אישרה השתתפות בטורניר ${d.tournament_name || ''} 🎉`
    case 'tournament_invite_declined': return `קבוצת ${d.team_name || ''} דחתה את ההזמנה לטורניר ${d.tournament_name || ''}`
    case 'official_assigned':              return `שובצת כ${ROLE_LABEL[d.role] || 'בעל תפקיד'} למשחק`
    case 'official_application':           return `${actorName(n)} הגיש/ה מועמדות כ${ROLE_LABEL[d.role] || 'בעל תפקיד'}`
    case 'official_application_approved':  return `מועמדותך לשיבוץ כ${ROLE_LABEL[d.role] || 'בעל תפקיד'} אושרה 🎉`
    case 'official_application_rejected':  return `מועמדותך לשיבוץ כ${ROLE_LABEL[d.role] || 'בעל תפקיד'} נדחתה`
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
    case 'game_change_opponent': return '🗓️'
    case 'game_change_approved': return '✅'
    case 'game_change_rejected': return '⛔'
    case 'team_join_request':    return '🤝'
    case 'team_join_approved':   return '✅'
    case 'team_join_rejected':   return '⛔'
    case 'player_submission_request':  return '🆕'
    case 'player_submission_approved': return '✅'
    case 'player_submission_rejected': return '⛔'
    case 'medical_submitted':    return '🩺'
    case 'medical_approved':     return '🩺'
    case 'medical_rejected':     return '⛔'
    case 'medical_expiring':     return '⏰'
    case 'tournament_invite':          return '🏆'
    case 'tournament_invite_accepted': return '✅'
    case 'tournament_invite_declined': return '⛔'
    case 'official_assigned':              return '⚖️'
    case 'official_application':           return '📝'
    case 'official_application_approved':  return '✅'
    case 'official_application_rejected':  return '⛔'
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
    case 'game_change_opponent':
    case 'game_result':
    case 'game_change_approved':
    case 'game_change_rejected':  return n.entity_id ? `/games/${n.entity_id}` : '/games'
    // reviewers land on the /admin review tabs
    case 'team_join_request':
    case 'player_submission_request':
    case 'medical_submitted':      return '/admin'
    // the player / submitter lands where the outcome lives
    case 'team_join_approved':
    case 'team_join_rejected':     return n.entity_id ? `/teams/${n.entity_id}` : '/me'
    case 'player_submission_approved': return n.data?.player_id ? `/players/${n.data.player_id}` : '/me'
    case 'player_submission_rejected':
    case 'medical_approved':
    case 'medical_rejected':
    case 'medical_expiring':       return '/me'
    case 'tournament_invite':
    case 'tournament_invite_accepted':
    case 'tournament_invite_declined': return n.entity_id ? `/tournaments/${n.entity_id}` : '/tournaments'
    case 'official_assigned':
    case 'official_application_approved':
    case 'official_application_rejected': return n.entity_id ? `/games/${n.entity_id}` : '/games'
    case 'official_application':          return '/admin'
    case 'post_like':
    case 'post_comment':
    default:               return '/'
  }
}
