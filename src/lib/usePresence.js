import { useState, useEffect } from 'react'
import { supabase } from './supabase'

/**
 * Real-time "who's online" via Supabase Realtime Presence — an authentic count of
 * connected clients (no polling, no DB). Every client (web + the native apps) joins
 * ONE shared `online` channel on load and announces its platform; a closed tab/app
 * drops off automatically within the presence timeout.
 *
 * Mount `usePresence()` ONCE near the app root so every visitor is counted. It returns
 * a live { total, web, ios, android } breakdown.
 *
 * Mobile contract: the iOS / Android apps join channel `online`, presence key = a
 * stable per-install id, and track({ platform: 'ios' | 'android', user_id }). Then
 * they appear in the breakdown here automatically.
 */

const CHANNEL = 'online'

// One stable id per BROWSER (persisted in localStorage → survives tabs + reloads, so a
// person counts once). Computed ONCE per page-load and cached in-memory: this is what
// keeps the count authentic — StrictMode/HMR re-subscribes, or a browser where
// localStorage is unavailable, must NOT mint a fresh key each time (that over-counts).
let CACHED_ID
function clientId() {
  if (CACHED_ID) return CACHED_ID
  if (typeof window === 'undefined') return 'server'
  const fresh = () => (crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36))
  try {
    let id = localStorage.getItem('presenceClientId')
    if (!id) { id = fresh(); localStorage.setItem('presenceClientId', id) }
    CACHED_ID = id
  } catch {
    CACHED_ID = fresh() // no localStorage → stable for this page-load at least
  }
  return CACHED_ID
}

export function usePresence({ platform = 'web', track = true } = {}) {
  const [state, setState] = useState({ total: 0, web: 0, ios: 0, android: 0 })

  useEffect(() => {
    const channel = supabase.channel(CHANNEL, { config: { presence: { key: clientId() } } })

    const sync = () => {
      const ps = channel.presenceState() // { key: [ { platform, ... } ] }
      let web = 0, ios = 0, android = 0
      for (const entries of Object.values(ps)) {
        const p = entries[0]?.platform
        if (p === 'ios') ios++
        else if (p === 'android') android++
        else web++ // default/unknown → web
      }
      setState({ total: web + ios + android, web, ios, android })
    }

    channel
      .on('presence', { event: 'sync' }, sync)
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return
        if (track) {
          const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }))
          await channel.track({ platform, user_id: user?.id ?? null, at: Date.now() })
        } else {
          sync()
        }
      })

    return () => { supabase.removeChannel(channel) }
  }, [platform, track])

  return state
}
