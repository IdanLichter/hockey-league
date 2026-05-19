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
