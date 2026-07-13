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

// ----- coach request → league-manager approval -----

/** A coach submits a PENDING tournament request for themselves (RLS-gated). */
export async function requestTournament(payload) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('not-authenticated')
  const { data, error } = await supabase
    .from('tournaments')
    .insert({ ...payload, status: 'pending', created_by: user.id })
    .select().single()
  if (error) throw error
  return data
}

/** The signed-in coach's own requests (any status), newest first. */
export async function getMyTournamentRequests() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('tournaments').select('*')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

/** League manager / admin approves (→ active) or rejects (→ rejected) a request. */
export async function reviewTournament(id, approve) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('tournaments')
    .update({ status: approve ? 'active' : 'rejected', approved_by: user?.id || null })
    .eq('id', id)
  if (error) throw error
}

/** A coach cancels their own still-pending request. */
export async function cancelTournamentRequest(id) {
  const { error } = await supabase.from('tournaments').delete().eq('id', id)
  if (error) throw error
}
