import { supabase } from './supabase'

/**
 * The signed-in user from the LOCAL session, or null.
 *
 * Use this, not supabase.auth.getUser(), when all you need is the id to filter or
 * insert by. getUser() is a network round trip to the auth server made while
 * holding supabase-js's auth lock — and every REST call awaits that same lock —
 * so each one stalls every query queued behind it. On /market five of them in a
 * row pushed the first data request from ~2s to ~5.4s after load.
 *
 * Trusting the local session is safe here: RLS checks the JWT server-side on the
 * request itself. Keep getUser() for the rare place that must know the account
 * still exists server-side before acting (none today).
 */
export async function sessionUser() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.user ?? null
  } catch {
    return null
  }
}
