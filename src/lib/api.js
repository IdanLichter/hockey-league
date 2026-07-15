import { supabase } from './supabase'
import { countsForStats } from './leagueStats'

// Fetch every row, paging past PostgREST's 1000-row cap (a plain select silently
// truncates at 1000). Used for tables that can grow beyond that within a season.
async function fetchAllRows(table, select = '*', orderCol = 'id') {
  const out = []
  const size = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from(table).select(select).order(orderCol, { ascending: true }).range(from, from + size - 1)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < size) break
    from += size
  }
  return out
}

export async function getTeams(orderBy = 'points', ascending = false) {
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .eq('status', 'active')
    .order(orderBy, { ascending })
  if (error) throw error
  return data
}

// ----- user-created teams (Package 1a) -----

/** Teams awaiting league-manager/admin approval, oldest first. */
export async function getPendingTeams() {
  const { data, error } = await supabase
    .from('teams').select('*').eq('status', 'pending')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

/** A linked player proposes a new team (pending). Returns the new team id. */
export async function requestTeam(name, ageGroups, city = null) {
  const { data, error } = await supabase.rpc('request_team', {
    p_name: name, p_age_groups: ageGroups, p_city: city || null,
  })
  if (error) {
    if (/not a linked player/i.test(error.message || '')) throw new Error('not-linked-player')
    throw error
  }
  return data
}

/** League-manager/admin approves (→ active, creator becomes coach) or rejects a team. */
export async function reviewTeam(teamId, approve) {
  const { error } = await supabase.rpc('review_team', { p_team_id: teamId, p_approve: approve })
  if (error) {
    if (/not authorized/i.test(error.message || '')) throw new Error('not-authorized')
    throw error
  }
}

/** The signed-in user's own team requests (any status), newest first. */
export async function getMyTeamRequests() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('teams').select('*').eq('created_by', user.id)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getPlayers(orderBy = 'goals', ascending = false) {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .order(orderBy, { ascending })
  if (error) throw error
  return data
}

export async function getGames(orderBy = 'game_date', ascending = false) {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .order(orderBy, { ascending })
  if (error) throw error
  return data
}

export async function getGameStats() {
  // game_stats grows ~13 rows/game and will exceed 1000 within a season — page it.
  return fetchAllRows('game_stats', '*', 'id')
}

export async function getReferees() {
  const { data, error } = await supabase
    .from('referees')
    .select('*')
  if (error) throw error
  return data
}

export async function getGameById(id) {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function getGameStatsByGameId(gameId) {
  const { data, error } = await supabase
    .from('game_stats')
    .select('*')
    .eq('game_id', gameId)
  if (error) throw error
  return data
}

// ============ FEED POSTS (Stage B2) ============

export async function getPosts() {
  const { data, error } = await supabase
    .from('posts')
    .select('*, author:profiles!posts_author_id_fkey(display_name, avatar_url, player_id), like_count:post_likes(count), comment_count:comments(count)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(p => ({
    ...p,
    like_count: p.like_count?.[0]?.count ?? 0,
    comment_count: p.comment_count?.[0]?.count ?? 0,
  }))
}

// Public role badges for a set of user ids (post authors, a player's linked
// account). Uses the public_role_badges RPC so viewers can see others' league
// roles despite the "read own roles" RLS on user_roles.
// Returns a map: { [userId]: { isAdmin: boolean, roles: [{role, team_id}] } }.
export async function getRoleBadges(userIds = []) {
  const ids = [...new Set((userIds || []).filter(Boolean))]
  if (!ids.length) return {}
  const { data, error } = await supabase.rpc('public_role_badges', { p_user_ids: ids })
  if (error) { console.error('getRoleBadges', error); return {} }
  const map = {}
  for (const row of data || []) {
    map[row.user_id] = { isAdmin: !!row.is_admin, roles: row.roles || [] }
  }
  return map
}

// Role badges for the account (if any) linked to a given player — used on the
// player page. Resolves player → profile(s) (public-readable) → role badges.
// Returns { isAdmin, roles } or null when the player has no linked account/role.
export async function getPlayerRoleBadges(playerId) {
  if (!playerId) return null
  const { data: profs, error } = await supabase
    .from('profiles').select('id').eq('player_id', playerId)
  if (error || !profs?.length) return null
  const map = await getRoleBadges(profs.map(p => p.id))
  let isAdmin = false
  const roles = []
  for (const p of profs) {
    const entry = map[p.id]
    if (!entry) continue
    if (entry.isAdmin) isAdmin = true
    for (const r of entry.roles) roles.push(r)
  }
  return (isAdmin || roles.length) ? { isAdmin, roles } : null
}

export async function createPost({ body, teamId = null }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('not authenticated')
  const { data, error } = await supabase
    .from('posts')
    .insert({ author_id: user.id, body: body.trim(), team_id: teamId })
    .select('*, author:profiles!posts_author_id_fkey(display_name, avatar_url, player_id)')
    .single()
  if (error) throw error
  return { ...data, like_count: 0, comment_count: 0 }
}

export async function deletePost(id) {
  // soft delete
  const { error } = await supabase.from('posts').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function editPost(id, body) {
  // posts.body CHECK: 1..2000 chars. `updated_at` exists (auto-touched by trigger too).
  const trimmed = (body || '').trim().slice(0, 2000)
  if (!trimmed) throw new Error('empty body')
  const { error } = await supabase
    .from('posts')
    .update({ body: trimmed, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// --- Likes ---
export async function getMyLikes() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from('post_likes').select('post_id').eq('user_id', user.id)
  if (error) throw error
  return (data || []).map(r => r.post_id)
}

export async function likePost(postId) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('not authenticated')
  const { error } = await supabase.from('post_likes').insert({ post_id: postId, user_id: user.id })
  // PK is (post_id, user_id): a double-click / stale-UI re-like returns 23505.
  // Liking is idempotent, so treat a duplicate as success instead of surfacing an error.
  if (error && error.code !== '23505') throw error
}

export async function unlikePost(postId) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('not authenticated')
  const { error } = await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', user.id)
  if (error) throw error
}

// --- Comments ---
export async function getComments(postId) {
  const { data, error } = await supabase
    .from('comments')
    .select('*, author:profiles!comments_author_id_fkey(display_name, avatar_url, player_id)')
    .eq('post_id', postId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function createComment(postId, body) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('not authenticated')
  const { data, error } = await supabase
    .from('comments')
    .insert({ post_id: postId, author_id: user.id, body: body.trim() })
    .select('*, author:profiles!comments_author_id_fkey(display_name, avatar_url, player_id)')
    .single()
  if (error) throw error
  return data
}

export async function deleteComment(id) {
  const { error } = await supabase.from('comments').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function editComment(id, body) {
  // comments.body CHECK: 1..1000 chars. The comments table has NO updated_at column, so set body only.
  const trimmed = (body || '').trim().slice(0, 1000)
  if (!trimmed) throw new Error('empty body')
  const { error } = await supabase.from('comments').update({ body: trimmed }).eq('id', id)
  if (error) throw error
}

// ============ ADMIN OPERATIONS ============

// --- Games ---
export async function createGame(game) {
  const { data, error } = await supabase.from('games').insert(game).select().single()
  if (error) throw error
  return data
}

/** Insert many games at once (tournament schedule generation). */
export async function createGames(games) {
  const { data, error } = await supabase.from('games').insert(games).select()
  if (error) throw error
  return data
}

export async function updateGame(id, updates) {
  const { data, error } = await supabase.from('games').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteGame(id) {
  const { error } = await supabase.from('games').delete().eq('id', id)
  if (error) throw error
}

// --- Players ---
export async function createPlayer(player) {
  const { data, error } = await supabase.from('players').insert(player).select().single()
  if (error) throw error
  return data
}

export async function updatePlayer(id, updates) {
  const { data, error } = await supabase.from('players').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deletePlayer(id) {
  const { error } = await supabase.from('players').delete().eq('id', id)
  if (error) throw error
}

// --- Teams ---
export async function updateTeam(id, updates) {
  const { data, error } = await supabase.from('teams').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

// --- Game Stats ---
export async function createGameStat(stat) {
  const { data, error } = await supabase.from('game_stats').insert(stat).select().single()
  if (error) throw error
  return data
}

export async function updateGameStat(id, updates) {
  const { data, error } = await supabase.from('game_stats').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteGameStat(id) {
  const { error } = await supabase.from('game_stats').delete().eq('id', id)
  if (error) throw error
}

export async function deleteGameStatsByGameId(gameId) {
  const { error } = await supabase.from('game_stats').delete().eq('game_id', gameId)
  if (error) throw error
}

// --- Admin Users ---
// admin_users SELECT is locked to the caller's own row (so checkAdmin works
// without leaking the admin list to every logged-in user). The full list comes
// from the is_admin()-gated list_admins() RPC. Fall back to a direct read for
// resilience (older/behind DB, or the RPC erroring).
export async function getAdminUsers() {
  const { data, error } = await supabase.rpc('list_admins')
  if (!error && Array.isArray(data)) return data
  const res = await supabase.from('admin_users').select('*').order('created_at')
  if (res.error) throw res.error
  return res.data
}

export async function addAdminUser(email, name) {
  const { data, error } = await supabase.from('admin_users').insert({ email, name }).select().single()
  if (error) throw error
  return data
}

export async function removeAdminUser(id) {
  const { error } = await supabase.from('admin_users').delete().eq('id', id)
  if (error) throw error
}

// --- League Settings ---
export async function getLeagueSetting(key) {
  const { data, error } = await supabase
    .from('league_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()
  if (error) throw error
  return data?.value || null
}

export async function setLeagueSetting(key, value) {
  const { error } = await supabase
    .from('league_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw error
}

// ============ ARCHIVE & SEASON MANAGEMENT ============

export async function getArchivedSeasons() {
  const { data, error } = await supabase
    .from('archived_seasons')
    .select('*')
    .order('archived_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getArchivedStandings(seasonId) {
  const { data, error } = await supabase
    .from('archived_team_standings')
    .select('*')
    .eq('season_id', seasonId)
    .order('final_rank')
  if (error) throw error
  return data
}

export async function getArchivedPlayerStats(seasonId) {
  const { data, error } = await supabase
    .from('archived_player_stats')
    .select('*')
    .eq('season_id', seasonId)
    .order('goals', { ascending: false })
  if (error) throw error
  return data
}

export async function getArchivedGames(seasonId) {
  const { data, error } = await supabase
    .from('archived_games')
    .select('*')
    .eq('season_id', seasonId)
    .order('game_date', { ascending: false })
  if (error) throw error
  return data
}

/**
 * Archive the current season and reset all stats.
 * @param {string} seasonName - e.g. "2024-25"
 */
export async function archiveAndResetSeason(seasonName) {
  // One atomic, admin-gated RPC (supabase/archive-season-rpc.sql). Replaces the
  // old ~90-write browser loop that had no transaction — a mid-way failure used
  // to permanently corrupt the season. The RPC archives standings/players/games/
  // box-scores, wipes the live season, and resets season_mode, all-or-nothing.
  const { data, error } = await supabase.rpc('archive_and_reset_season', { p_season_name: seasonName })
  if (error) throw error
  return { id: data, name: seasonName }
}

// ============ STATS RECALCULATION ============

/**
 * Recalculate all team standings from completed games.
 * Points: 3 for win, 1 for tie, 0 for loss.
 */
export async function recalculateTeamStats() {
  // Server-side via one SECURITY DEFINER RPC, self-gated on is_admin() OR
  // is_judge(). Judges manage games but deliberately have NO write policy on
  // `teams` — otherwise they could rename teams and rewrite the table through
  // the REST API. The RPC runs the same wins*3 + ties math this used to do in
  // the browser, and was verified to reproduce all 7 teams' standings exactly.
  const { error } = await supabase.rpc('recompute_all_team_standings')
  if (error) throw error
}

/**
 * Recalculate all player stats from game_stats entries.
 *
 * NOTE: This is intentionally NOT auto-invoked right now. The historical
 * game_stats table has not been backfilled yet, so running this against an
 * (near-)empty table would zero out every player's totals. It is left here
 * (and guarded below) so that, once the historical backfill is complete
 * (Package 2), it can be re-enabled as the authoritative source for player
 * goals/blue_cards/red_cards/games_played.
 */
export async function recalculatePlayerStats() {
  const [players, rawStats, games] = await Promise.all([getPlayers(), getGameStats(), getGames()])

  // Safety guard: never wipe player stats from an empty game_stats table.
  if (!rawStats || rawStats.length === 0) {
    console.warn('recalculatePlayerStats: game_stats is empty — skipping to avoid zeroing all player totals.')
    return
  }

  // Friendly (ידידותי) games never count toward player totals — drop their box
  // scores before aggregating (mirrors recompute_team_standings on the DB side).
  const competitiveGameIds = new Set(games.filter(countsForStats).map(g => g.id))
  const allStats = rawStats.filter(s => competitiveGameIds.has(s.game_id))

  for (const player of players) {
    const pStats = allStats.filter(s => s.player_id === player.id)
    const goals = pStats.reduce((sum, s) => sum + (s.goals || 0), 0)
    const blue_cards = pStats.reduce((sum, s) => sum + (s.blue_cards || 0), 0)
    const red_cards = pStats.reduce((sum, s) => sum + (s.red_cards || 0), 0)
    const games_played = pStats.length

    await updatePlayer(player.id, {
      goals, blue_cards, red_cards, games_played
    })
  }
}
