import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './AuthContext'

/**
 * Who uses the native apps. There is no install event — an account counts as an
 * app user once the app has signed in with it (auth session user-agent, a native
 * push registration, or native telemetry). See supabase/app-users.sql.
 */

/** Every account, one row each, with its app/web footprint. Admin-only RPC. */
export async function getAppUsers() {
  const { data, error } = await supabase.rpc('admin_app_users')
  if (error) throw error
  return data || []
}

const cacheKey = (uid) => `rh_app_platforms:${uid}`

/**
 * The signed-in user's own app platforms (['ios'], ['android'], [] …), or null
 * while unknown. Cached per user for the tab's life so the feed's "download the
 * app" prompts don't flash in and out on every navigation. A failed lookup stays
 * null — callers treat null as "don't know", i.e. keep showing the prompt.
 */
export function useMyAppPlatforms() {
  const { user } = useAuth()
  const uid = user?.id
  const [platforms, setPlatforms] = useState(() => {
    if (!uid) return null
    try { return JSON.parse(sessionStorage.getItem(cacheKey(uid)) || 'null') } catch { return null }
  })

  useEffect(() => {
    if (!uid) { setPlatforms(null); return }
    let alive = true
    supabase.rpc('my_app_platforms').then(({ data, error }) => {
      if (!alive || error || !Array.isArray(data)) return
      setPlatforms(data)
      try { sessionStorage.setItem(cacheKey(uid), JSON.stringify(data)) } catch { /* private mode */ }
    })
    return () => { alive = false }
  }, [uid])

  return platforms
}

/** True only when we KNOW this user already has the app. */
export function useHasNativeApp() {
  const platforms = useMyAppPlatforms()
  return Array.isArray(platforms) && platforms.length > 0
}
