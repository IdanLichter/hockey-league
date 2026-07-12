import { supabase } from './supabase'

/**
 * Youth tournaments. There is ONE senior league (בוגרים); tournaments are
 * self-contained youth competitions (see lib/ageGroups). A tournament game is a
 * normal `games` row tagged with `tournament_id` — it runs on the same judge
 * scoreboard, but is EXCLUDED from the senior league standings/stats (both the
 * server-side recompute_team_standings and countsForStats in lib/leagueStats).
 * Writes are admin-gated for now (RLS); a coach-request → manager-approve flow
 * comes later.
 */

export async function getTournaments() {
  const { data, error } = await supabase
    .from('tournaments')
    .select('*')
    .order('start_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getTournamentById(id) {
  const { data, error } = await supabase
    .from('tournaments').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

/** Games belonging to a tournament, chronological. */
export async function getTournamentGames(tournamentId) {
  const { data, error } = await supabase
    .from('games').select('*')
    .eq('tournament_id', tournamentId)
    .order('game_date', { ascending: true })
  if (error) throw error
  return data || []
}

export async function createTournament(t) {
  const { data, error } = await supabase.from('tournaments').insert(t).select().single()
  if (error) throw error
  return data
}

export async function updateTournament(id, updates) {
  const { data, error } = await supabase.from('tournaments').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteTournament(id) {
  const { error } = await supabase.from('tournaments').delete().eq('id', id)
  if (error) throw error
}
