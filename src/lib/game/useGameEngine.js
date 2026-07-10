import { useRef, useEffect, useSyncExternalStore } from 'react'
import { GameEngine } from './engine'

const LS = (id) => `judge-engine-${id}`
const SAVE_EVERY_MS = 1000

// Games whose result has been persisted to the DB. A throttled write must never
// resurrect the draft of a game that was already finished and saved.
const finished = new Set()

/**
 * React binding for the GameEngine. Instantiates one engine per game (mapping the
 * DB home/away teams onto the engine's home/guest), restores any localStorage
 * draft, drives a ~20fps tick while the clock/break is live, and re-renders on
 * every engine change. Persists a draft (at most once a second) so a refresh
 * mid-game loses nothing.
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

  // Persist a draft, at most once a second. The engine bumps `version` on every 50ms
  // tick, and serializing the whole match 20×/sec janks the live scoreboard for no
  // durability gain — a trailing write keeps the saved clock within one second of live.
  const save = useRef({ at: 0, timer: null })
  const write = () => {
    save.current.at = Date.now()
    save.current.timer = null
    if (finished.has(game.id)) return
    try { localStorage.setItem(LS(game.id), JSON.stringify(engine.serialize())) } catch { /* ignore */ }
  }

  // tick loop (20fps) — only advances while the clock/break is live
  useEffect(() => {
    const iv = setInterval(() => { if (engine.needsTicking()) engine.tick() }, 50)
    return () => clearInterval(iv)
  }, [engine])

  useEffect(() => {
    const since = Date.now() - save.current.at
    if (since >= SAVE_EVERY_MS) write()
    else if (!save.current.timer) save.current.timer = setTimeout(write, SAVE_EVERY_MS - since)
  }, [version, engine, game.id])

  // Flush the last pending write when the judge leaves the screen.
  useEffect(() => {
    const t = save.current
    return () => {
      if (!t.timer) return
      clearTimeout(t.timer)
      t.timer = null
      if (finished.has(game.id)) return
      try { localStorage.setItem(LS(game.id), JSON.stringify(engine.serialize())) } catch { /* ignore */ }
    }
  }, [engine, game.id])

  return engine
}

export const clearEngineDraft = (gameId) => {
  finished.add(gameId)
  try { localStorage.removeItem(LS(gameId)) } catch { /* ignore */ }
}
