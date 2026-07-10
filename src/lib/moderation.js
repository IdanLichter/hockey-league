import { supabase } from './supabase'

// Reporting + blocking. Mirrors the mobile apps' moderation surface.
// The `content_reports` / `user_blocks` tables and their RLS already exist in prod:
//   content_reports: insert-as-self (authenticated), select own-or-admin, update admin
//   user_blocks:     all-own (authenticated), CHECK blocker_id <> blocked_id
// Both FK to auth.users, not profiles, so authors/reporters are resolved with a
// separate profiles lookup rather than a PostgREST embed.

export const TARGET_POST = 'post'
export const TARGET_COMMENT = 'comment'
export const TARGET_ITEM_COMMENT = 'feed_item_comment'

// Table backing each target_type, and whether it carries a post_id/item_key for context.
const TARGET_TABLE = {
  [TARGET_POST]: 'posts',
  [TARGET_COMMENT]: 'comments',
  [TARGET_ITEM_COMMENT]: 'feed_item_comments',
}

export const TARGET_LABEL = {
  [TARGET_POST]: 'פוסט',
  [TARGET_COMMENT]: 'תגובה',
  [TARGET_ITEM_COMMENT]: 'תגובה',
}

// DB caps: reason <= 60 chars, details <= 500.
export const REPORT_REASONS = [
  'תוכן פוגעני',
  'הטרדה או בריונות',
  'ספאם או פרסום',
  'מידע שגוי',
  'תוכן מיני',
  'אחר',
]

export const REASON_MAX = 60
export const DETAILS_MAX = 500

async function currentUserId() {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id || null
}

// ============ REPORTING (any signed-in user) ============

export async function reportContent({ targetType, targetId, reason, details = null }) {
  const me = await currentUserId()
  if (!me) throw new Error('not authenticated')
  if (!TARGET_TABLE[targetType]) throw new Error(`unknown target_type: ${targetType}`)
  const trimmed = (reason || '').trim().slice(0, REASON_MAX)
  if (!trimmed) throw new Error('reason required')
  const { error } = await supabase.from('content_reports').insert({
    reporter_id: me,
    target_type: targetType,
    target_id: targetId,
    reason: trimmed,
    details: details ? details.trim().slice(0, DETAILS_MAX) : null,
  })
  if (error) throw error
}

// ============ BLOCKING (any signed-in user) ============

export async function getMyBlocks() {
  const me = await currentUserId()
  if (!me) return []
  const { data, error } = await supabase.from('user_blocks').select('blocked_id').eq('blocker_id', me)
  if (error) throw error
  return (data || []).map(r => r.blocked_id)
}

export async function blockUser(blockedId) {
  const me = await currentUserId()
  if (!me) throw new Error('not authenticated')
  if (me === blockedId) throw new Error('cannot block yourself')
  const { error } = await supabase.from('user_blocks').insert({ blocker_id: me, blocked_id: blockedId })
  if (error && error.code !== '23505') throw error // already blocked is fine
}

export async function unblockUser(blockedId) {
  const me = await currentUserId()
  if (!me) throw new Error('not authenticated')
  const { error } = await supabase.from('user_blocks').delete().eq('blocker_id', me).eq('blocked_id', blockedId)
  if (error) throw error
}

// Blocked users, with their profile, for a "manage blocked" list.
export async function getBlockedProfiles() {
  const ids = await getMyBlocks()
  if (!ids.length) return []
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', ids)
  if (error) throw error
  return data || []
}

// ============ ADMIN REVIEW QUEUE ============

async function fetchProfiles(ids) {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return {}
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', unique)
  if (error) throw error
  return Object.fromEntries((data || []).map(p => [p.id, p]))
}

// target_id has no FK, so the target row is resolved per target_type in a batch
// per table. Admins can read soft-deleted rows (RLS: deleted_at is null OR is_admin()).
async function fetchTargets(reports) {
  const byType = {}
  for (const r of reports) (byType[r.target_type] ||= []).push(r.target_id)

  const targets = {}
  await Promise.all(Object.entries(byType).map(async ([type, ids]) => {
    const table = TARGET_TABLE[type]
    if (!table) return
    const { data, error } = await supabase
      .from(table)
      .select('id, body, author_id, deleted_at, created_at')
      .in('id', [...new Set(ids)])
    if (error) throw error
    for (const row of data || []) targets[`${type}:${row.id}`] = row
  }))
  return targets
}

export async function getReports(status = 'open') {
  let q = supabase.from('content_reports').select('*').order('created_at', { ascending: false })
  if (status) q = q.eq('status', status)
  const { data: reports, error } = await q
  if (error) throw error
  if (!reports?.length) return []

  const targets = await fetchTargets(reports)
  const profiles = await fetchProfiles([
    ...reports.map(r => r.reporter_id),
    ...Object.values(targets).map(t => t.author_id),
  ])

  return reports.map(r => {
    const target = targets[`${r.target_type}:${r.target_id}`] || null
    return {
      ...r,
      reporter: profiles[r.reporter_id] || null,
      target,                                        // null => already hard-deleted
      author: target ? profiles[target.author_id] || null : null,
    }
  })
}

export async function resolveReport(id, status) {
  if (!['actioned', 'dismissed'].includes(status)) throw new Error(`bad status: ${status}`)
  const me = await currentUserId()
  const { error } = await supabase
    .from('content_reports')
    .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: me })
    .eq('id', id)
  if (error) throw error
}

// Soft-delete the reported row straight from the queue. Same tables, same
// deleted_at convention; RLS already allows `author_id = auth.uid() OR is_admin()`.
export async function removeReportedContent(targetType, targetId) {
  const table = TARGET_TABLE[targetType]
  if (!table) throw new Error(`unknown target_type: ${targetType}`)
  const { error } = await supabase
    .from(table)
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', targetId)
  if (error) throw error
}
