import { useState, useEffect } from 'react'
import { supabase } from './supabase'

// One stable id per browser tab so each open viewer counts exactly once (anon
// spectators included — presence rides the Realtime socket, no auth needed).
function viewerKey() {
  if (typeof window === 'undefined') return 'server'
  if (!window.__streamViewerKey) {
    window.__streamViewerKey = Math.random().toString(36).slice(2) + Date.now().toString(36)
  }
  return window.__streamViewerKey
}

/**
 * Live viewer count for a game's stream via Supabase Realtime Presence.
 *
 * While `active`, this tab joins the `stream-viewers:<gameId>` channel; the count
 * is the number of tabs currently present (people with the live stream open).
 * `track` = whether THIS tab counts itself — viewers track (true), the broadcaster
 * subscribes to see the number without inflating it (false). 0 when inactive.
 */
export function useStreamViewers(gameId, active, track = true) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!gameId || !active) { setCount(0); return }
    const channel = supabase.channel(`stream-viewers:${gameId}`, {
      config: { presence: { key: viewerKey() } },
    })
    const sync = () => setCount(Object.keys(channel.presenceState()).length)
    channel
      .on('presence', { event: 'sync' }, sync)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && track) channel.track({ at: Date.now() })
      })
    return () => { supabase.removeChannel(channel) }
  }, [gameId, active, track])

  return count
}
