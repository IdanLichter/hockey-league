import { useRef, useEffect, useSyncExternalStore } from 'react'
import { GameEngine } from './engine'

const LS = (id) => `judge-engine-${id}`

/**
 * React binding for the GameEngine. Instantiates one engine per game (mapping the
 * DB home/away teams onto the engine's home/guest), restores any localStorage
 * draft, drives a ~20fps tick while the clock/break is live, and re-renders on
 * every engine change. Persists a draft on each change so a refresh mid-game
 * loses nothing.
 */
export function useGameEngine(game, home, guest) {
  const ref = useRef(null)
  if (!ref.current) {
    const e = new GameEngine({ homeName: home?.name || 'בית', guestName: guest?.name || 'חוץ' })
    try {
      const raw = localStorage.getItem(LS(game.id))
      if (raw) e.restore(JSON.parse(raw))
    } catch { /* ignore */ }
    ref.current = e
  }
  const engine = ref.current

  const version = useSyncExternalStore(
    (cb) => engine.subscribe(cb),
    () => engine.version,
    () => engine.version,
  )

  // tick loop (20fps) — only advances while the clock/break is live
  useEffect(() => {
    const iv = setInterval(() => { if (engine.needsTicking()) engine.tick() }, 50)
    return () => clearInterval(iv)
  }, [engine])

  // persist a draft on every change
  useEffect(() => {
    try { localStorage.setItem(LS(game.id), JSON.stringify(engine.serialize())) } catch { /* ignore */ }
  }, [version, engine, game.id])

  return engine
}

export const clearEngineDraft = (gameId) => {
  try { localStorage.removeItem(LS(gameId)) } catch { /* ignore */ }
}
