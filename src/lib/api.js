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

// ============ STATS RECALCULATION ============

/**
 * Recalculate all team standings from completed games.
 * Points: 3 for win, 1 for tie, 0 for loss.
 */
export async function recalculateTeamStats() {
  const [teams, games] = await Promise.all([getTeams(), getGames()])
  const completed = games.filter(g => g.status === 'completed' && g.home_score != null && g.away_score != null)

  for (const team of teams) {
    let wins = 0, losses = 0, ties = 0, goals_for = 0, goals_against = 0

    for (const game of completed) {
      if (game.home_team_id === team.id) {
        goals_for += game.home_score
        goals_against += game.away_score
        if (game.home_score > game.away_score) wins++
        else if (game.home_score < game.away_score) losses++
        else ties++
      } else if (game.away_team_id === team.id) {
        goals_for += game.away_score
        goals_against += game.home_score
        if (game.away_score > game.home_score) wins++
        else if (game.away_score < game.home_score) losses++
        else ties++
      }
    }

    const points = wins * 3 + ties * 1

    await updateTeam(team.id, {
      wins, losses, ties, points, goals_for, goals_against
    })
  }
}

/**
 * Recalculate all player stats from game_stats entries.
 */
export async function recalculatePlayerStats() {
  const [players, allStats] = await Promise.all([getPlayers(), getGameStats()])

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
