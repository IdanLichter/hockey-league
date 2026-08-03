import { supabase } from './supabase'

/**
 * Notification readiness (P0). A scheduled reminder is only worth as much as its
 * delivery, and the funnel is steep: a player must have an account AND have allowed
 * push before anything can reach his phone. This backs the admin chase-list so the
 * gaps get closed before the test rather than discovered during it.
 *
 * Backed by the notification_readiness RPC (admin / league-manager only — it exposes
 * who has and hasn't signed up).
 */

/** One row per player: { player_id, first_name, last_name, team_id, team_name,
 *  has_account, has_push }. Ordered worst-first by the RPC. */
export async function getNotificationReadiness() {
  const { data, error } = await supabase.rpc('notification_readiness')
  if (error) throw error
  return data || []
}

/** The three reachability states, worst first. */
export const REACH = {
  none: 'none',       // no account at all — unreachable by any channel we own
  app_only: 'app',    // has an account, but no push: only sees the bell if he opens the app
  push: 'push',       // a reminder actually reaches his phone
}

export function reachOf(row) {
  if (!row.has_account) return REACH.none
  return row.has_push ? REACH.push : REACH.app_only
}
