import { useState, useEffect } from 'react'
import { getLiveGames, subscribeLiveGames } from './live'

/**
 * Shared live-game discovery hook. Answers "which games are live right now?"
 * for any surface that wants to surface them (home feed, games list, …).
 *
 * Initial fetch → realtime refetch on any live_game_state change → a slow poll
 * as a safety net when Realtime isn't reachable. Returns the current array of
 * live rows (newest first), [] when nothing is live.
 */
export function useLiveGames() {
  const [live, setLive] = useState([])

  useEffect(() => {
    let alive = true
    const refetch = () => getLiveGames().then(rows => { if (alive) setLive(rows) }).catch(() => {})
    refetch()
    const unsub = subscribeLiveGames(refetch)
    const iv = setInterval(refetch, 45000)
    return () => { alive = false; unsub(); clearInterval(iv) }
  }, [])

  return live
}
