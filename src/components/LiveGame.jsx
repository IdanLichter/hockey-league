import { useState, useEffect } from "react"
import { getLiveGame, subscribeLiveGame } from "@/lib/live"
import { clockString } from "@/lib/game/format"
import TeamLogo from "@/components/TeamLogo"

/**
 * Public live scoreboard for a game in progress. Reads the `live_game_state`
 * row the judge broadcasts, subscribes for changes, and reconstructs the clock
 * on the client:
 *   - running  → remaining = clock_ends_at − now, re-derived every 200ms
 *   - paused   → clock_remaining_ms, frozen
 * No login required to watch. Renders nothing if there's no live data (the
 * parent then shows its normal content).
 */

// Remaining ms for the live row. Uses the absolute deadline while running so
// every viewer's clock agrees regardless of when they opened the page.
function remainingFrom(live) {
  if (!live) return 0
  if (live.is_running && live.clock_ends_at) {
    return Math.max(0, new Date(live.clock_ends_at).getTime() - Date.now())
  }
  return Math.max(0, live.clock_remaining_ms ?? 0)
}

function TeamPanel({ team, score, fallbackName }) {
  return (
    <div className="flex-1 min-w-0 flex flex-col items-center gap-2 text-center">
      <TeamLogo team={team} size={12} />
      <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate w-full">
        {team?.name || fallbackName}
      </span>
      <span className="text-4xl sm:text-6xl font-extrabold tabular-nums leading-none text-slate-900 dark:text-white">
        {score ?? 0}
      </span>
    </div>
  )
}

const EVENT_META = {
  goal: { icon: "⚽", label: "שער", accent: "text-emerald-600 dark:text-emerald-400" },
  blue: { icon: "🟦", label: "כרטיס כחול", accent: "text-blue-600 dark:text-blue-400" },
  red:  { icon: "🟥", label: "כרטיס אדום", accent: "text-red-600 dark:text-red-400" },
  foul: { icon: "🚩", label: "עבירה", accent: "text-slate-500 dark:text-slate-400" },
}

// One row in the live play-by-play. Events arrive fully resolved (player name +
// team side + game-clock time + period) in live_game_state.state, so this stays dumb.
function LiveEventRow({ ev, homeName, awayName }) {
  const meta = EVENT_META[ev.type] || EVENT_META.foul
  const teamName = ev.side === "home" ? homeName : awayName
  const time = ev.timeMS != null ? clockString(ev.timeMS) : null
  const when = [ev.period, time].filter(Boolean).join(" · ")
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <span className="text-base leading-none shrink-0" aria-hidden>{meta.icon}</span>
      <div className="min-w-0 flex-1 truncate">
        <span className={`font-semibold ${meta.accent}`}>{meta.label}</span>
        {ev.player && <span className="text-slate-700 dark:text-slate-200"> · {ev.player}</span>}
        <span className="text-slate-400 dark:text-slate-500"> · {teamName}</span>
      </div>
      {when && <span className="shrink-0 text-[11px] tabular-nums text-slate-400 dark:text-slate-500">{when}</span>}
    </div>
  )
}

export default function LiveGame({ gameId, home, away, initial = null }) {
  const [live, setLive] = useState(initial)
  const [loading, setLoading] = useState(!initial)
  const [remaining, setRemaining] = useState(() => remainingFrom(initial))

  // Initial fetch (skipped when the parent seeds `initial`) + realtime subscription.
  useEffect(() => {
    let alive = true
    if (!initial) {
      getLiveGame(gameId).then((row) => {
        if (!alive) return
        setLive(row)
        setLoading(false)
      })
    }
    const unsub = subscribeLiveGame(gameId, (row) => { if (alive) setLive(row) })
    return () => { alive = false; unsub() }
    // `initial` is a one-time seed; re-subscribing on gameId only is correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId])

  // Client-ticked clock. Re-syncs immediately on every new row, then ticks
  // against the fixed deadline while running.
  useEffect(() => {
    setRemaining(remainingFrom(live))
    if (!live?.is_running || !live?.clock_ends_at) return
    const iv = setInterval(() => setRemaining(remainingFrom(live)), 200)
    return () => clearInterval(iv)
  }, [live])

  if (loading) {
    return (
      <div className="card p-6 flex items-center justify-center min-h-[160px]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-orange-500 border-t-transparent" />
      </div>
    )
  }

  // No live data → let the parent render its normal (scheduled/completed) view.
  if (!live) return null

  const running = !!live.is_running
  const ended = live.phase === "over"

  return (
    <div className="card relative overflow-hidden p-4 sm:p-6 ring-1 ring-orange-500/40">
      {/* brand accent strip */}
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-orange-500 to-orange-400" />

      {/* status row: live pulse (right, RTL) + period (left) */}
      <div className="flex items-center justify-between mb-4">
        {ended ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
            תוצאה סופית
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-red-600 dark:text-red-400" aria-label="משחק חי">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
            משחק חי
          </span>
        )}
        {live.period && (
          <span className="stat-pill bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
            {live.period}
          </span>
        )}
      </div>

      {/* scoreboard: home (right) | clock | away (left) — each score standalone
          to sidestep the RTL away:home digit-pairing gotcha. */}
      <div className="flex items-center gap-3 sm:gap-6">
        <TeamPanel team={home} score={live.home_score} fallbackName="בית" />
        <div className="shrink-0 flex flex-col items-center gap-1.5">
          <div className={`font-mono font-extrabold tabular-nums leading-none text-3xl sm:text-5xl ${running ? "text-orange-500" : "text-slate-400 dark:text-slate-500"}`}>
            {clockString(remaining)}
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {running ? "רץ" : ended ? "הסתיים" : "מושהה"}
          </span>
        </div>
        <TeamPanel team={away} score={live.away_score} fallbackName="חוץ" />
      </div>

      {/* Live play-by-play — goals, cards and fouls the judge broadcasts. */}
      {Array.isArray(live.state?.events) && live.state.events.length > 0 && (
        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-700/50">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2.5">מהלך המשחק</h3>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {[...live.state.events].reverse().map((ev, i) => (
              <LiveEventRow key={ev.id || i} ev={ev} homeName={home?.name || "בית"} awayName={away?.name || "חוץ"} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
