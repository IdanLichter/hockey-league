import { supabase } from './supabase'

export async function getTeams(orderBy = 'points', ascending = false) {
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .order(orderBy, { ascending })
  if (error) throw error
  return data
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
  const { data, error } = await supabase
    .from('game_stats')
    .select('*')
  if (error) throw error
  return data
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
  if (error) throw error
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
export async function getAdminUsers() {
  const { data, error } = await supabase.from('admin_users').select('*').order('created_at')
  if (error) throw error
  return data
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
  // 1. Create season record
  const { data: season, error: sErr } = await supabase
    .from('archived_seasons')
    .insert({ name: seasonName })
    .select()
    .single()
  if (sErr) throw sErr

  // 2. Get current data
  const [teams, players, games, gameStats] = await Promise.all([
    getTeams(), getPlayers(), getGames(), getGameStats()
  ])
  const teamsMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const sorted = [...teams].sort((a, b) => (b.points || 0) - (a.points || 0))

  // 3. Archive team standings
  const teamStandings = sorted.map((t, i) => ({
    season_id: season.id,
    team_id: t.id,
    team_name: t.name,
    wins: t.wins || 0,
    losses: t.losses || 0,
    ties: t.ties || 0,
    points: t.points || 0,
    goals_for: t.goals_for || 0,
    goals_against: t.goals_against || 0,
    own_goals_received: t.own_goals_received || 0,
    final_rank: i + 1
  }))
  if (teamStandings.length > 0) {
    const { error } = await supabase.from('archived_team_standings').insert(teamStandings)
    if (error) throw error
  }

  // 4. Archive player stats
  const playerStats = players.map(p => ({
    season_id: season.id,
    player_id: p.id,
    player_first_name: p.first_name,
    player_last_name: p.last_name,
    team_id: p.team_id,
    team_name: teamsMap[p.team_id]?.name || '',
    position: p.position,
    goals: p.goals || 0,
    games_played: p.games_played || 0,
    blue_cards: p.blue_cards || 0,
    red_cards: p.red_cards || 0,
    is_core: p.is_core || false,
    is_referee: p.is_referee || false
  }))
  if (playerStats.length > 0) {
    const { error } = await supabase.from('archived_player_stats').insert(playerStats)
    if (error) throw error
  }

  // 5. Archive games
  for (const game of games) {
    const { data: archivedGame, error: gErr } = await supabase
      .from('archived_games')
      .insert({
        season_id: season.id,
        original_game_id: game.id,
        home_team_name: teamsMap[game.home_team_id]?.name || '',
        away_team_name: teamsMap[game.away_team_id]?.name || '',
        home_team_id: game.home_team_id,
        away_team_id: game.away_team_id,
        game_date: game.game_date,
        venue: game.venue,
        home_score: game.home_score,
        away_score: game.away_score,
        status: game.status,
        game_type: game.game_type,
        playoff_round: game.playoff_round,
        series_game: game.series_game
      })
      .select()
      .single()
    if (gErr) throw gErr

    // Archive game stats for this game
    const gStats = gameStats.filter(s => s.game_id === game.id)
    if (gStats.length > 0) {
      const archivedStats = gStats.map(s => {
        const player = players.find(p => p.id === s.player_id)
        return {
          season_id: season.id,
          archived_game_id: archivedGame.id,
          player_first_name: player?.first_name || s.guest_player_name || '',
          player_last_name: player?.last_name || '',
          team_name: teamsMap[player?.team_id]?.name || '',
          goals: s.goals || 0,
          blue_cards: s.blue_cards || 0,
          red_cards: s.red_cards || 0,
          clean_sheet: s.clean_sheet || false
        }
      })
      const { error } = await supabase.from('archived_game_stats').insert(archivedStats)
      if (error) throw error
    }
  }

  // 6. Delete all current game_stats and games
  const { error: delStats } = await supabase.from('game_stats').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (delStats) throw delStats
  const { error: delGames } = await supabase.from('games').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (delGames) throw delGames

  // 7. Reset team stats
  for (const team of teams) {
    await updateTeam(team.id, {
      wins: 0, losses: 0, ties: 0, points: 0,
      goals_for: 0, goals_against: 0, own_goals_received: 0
    })
  }

  // 8. Reset player stats
  for (const player of players) {
    await updatePlayer(player.id, {
      goals: 0, games_played: 0, blue_cards: 0, red_cards: 0
    })
  }

  // 9. Set season mode back to regular
  await setLeagueSetting('season_mode', 'regular')

  return season
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
  const [players, allStats] = await Promise.all([getPlayers(), getGameStats()])

  // Safety guard: never wipe player stats from an empty game_stats table.
  if (!allStats || allStats.length === 0) {
    console.warn('recalculatePlayerStats: game_stats is empty — skipping to avoid zeroing all player totals.')
    return
  }

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
