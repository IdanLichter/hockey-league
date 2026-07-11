import { supabase } from './supabase'

/**
 * Live-game bridge between the judge's authoritative GameEngine and public
 * spectators.
 *
 * The judge board runs the deadline-based engine locally; `broadcastGameState`
 * snapshots it into the `broadcast_game_state` RPC (judge/admin only, server
 * gated) so anyone watching /games/:id sees a live scoreboard. Spectators only
 * ever read — `getLiveGame` (public SELECT) + `subscribeLiveGame` (Realtime).
 *
 * We never stream the clock tick-by-tick: a running clock is sent as an
 * absolute deadline (`clock_ends_at`) and each spectator reconstructs the
 * remaining time locally. That's why broadcasts fire only on SIGNIFICANT
 * changes (score / running / phase / period), not ~20×/sec.
 */

// Map an engine snapshot onto the RPC args and upsert. Best-effort: a failed
// broadcast must never break live scoring for the judge, so errors are swallowed.
export async function broadcastGameState(engine, gameId) {
  if (!engine || !gameId) return
  try {
    const running = !!engine.isRunning
    const remainingMS = Math.max(0, Math.round(engine.clock?.remainingMS ?? 0))
    const { error } = await supabase.rpc('broadcast_game_state', {
      p_game_id: gameId,
      p_home: engine.homeFinalScore,
      p_away: engine.guestFinalScore,
      // running → hand spectators a deadline they can tick against; paused → a frozen value.
      p_clock_ends_at: running ? new Date(Date.now() + remainingMS).toISOString() : null,
      p_clock_remaining_ms: running ? null : remainingMS,
      p_is_running: running,
      p_period: engine.periodLabel,
      p_phase: engine.phase,
      p_state: {},
    })
    if (error) throw error
  } catch (e) {
    if (import.meta.env?.DEV) console.warn('broadcastGameState failed (ignored)', e)
  }
}

// Current live row for a game, or null. Public SELECT — safe for anon spectators.
export async function getLiveGame(gameId) {
  if (!gameId) return null
  const { data, error } = await supabase
    .from('live_game_state')
    .select('*')
    .eq('game_id', gameId)
    .maybeSingle()
  if (error) return null
  return data || null
}

// Realtime subscription for one game's live row. Invokes cb(row|null) on every
// change; a DELETE (game abandoned / finished) delivers null. Returns an
// unsubscribe fn. No-op-safe if Realtime isn't reachable — mirrors
// notifications.js subscribeToNotifications.
export function subscribeLiveGame(gameId, cb) {
  if (!gameId) return () => {}
  const channel = supabase
    .channel(`live_game:${gameId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'live_game_state', filter: `game_id=eq.${gameId}` },
      (payload) => cb(payload.eventType === 'DELETE' ? null : (payload.new || null)),
    )
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}

// Judge/admin only. status ∈ scheduled | in_progress | waiting_result.
// 'scheduled' abandons the game and clears its live state.
export async function setGameStatus(gameId, status) {
  const { error } = await supabase.rpc('set_game_status', {
    p_game_id: gameId,
    p_status: status,
  })
  if (error) throw error
}
