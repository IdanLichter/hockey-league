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
