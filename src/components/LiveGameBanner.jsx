import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { ChevronLeft } from "lucide-react"
import { clockString } from "@/lib/game/format"
import TeamLogo from "@/components/TeamLogo"

/**
 * Compact "watch now" strips for games being officiated live. One row per live
 * game, each ticking its own deadline-based clock (running → clock_ends_at − now;
 * paused → the frozen remaining ms), linking to the full scoreboard on
 * /games/:id. Renders nothing when nothing is live.
 *
 * The live_game_state row carries only game_id + scores, so the caller resolves
 * teams via gamesById + teamsMap (the same id-map pattern used across the app).
 */

function remainingFrom(live) {
  if (!live) return 0
  if (live.is_running && live.clock_ends_at) {
    return Math.max(0, new Date(live.clock_ends_at).getTime() - Date.now())
  }
  return Math.max(0, live.clock_remaining_ms ?? 0)
}

function LiveRow({ live, home, away }) {
  const [remaining, setRemaining] = useState(() => remainingFrom(live))

  // Re-sync on every new row, then tick against the fixed deadline while running.
  useEffect(() => {
    setRemaining(remainingFrom(live))
    if (!live?.is_running || !live?.clock_ends_at) return
    const iv = setInterval(() => setRemaining(remainingFrom(live)), 250)
    return () => clearInterval(iv)
  }, [live])

  const running = !!live.is_running
  const ended = live.phase === "over"

  return (
    <Link
      to={`/games/${live.game_id}`}
      className="group card-hover relative flex items-center gap-2 sm:gap-3 p-3 sm:p-3.5 overflow-hidden ring-1 ring-red-500/30 hover:ring-red-500/50"
      aria-label="צפו במשחק החי"
    >
      {/* red accent bar on the leading (right, RTL) edge */}
      <span className="absolute inset-y-0 right-0 w-1 bg-red-500" aria-hidden="true" />

      {/* LIVE pulse / final */}
      <span className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-extrabold text-red-600 dark:text-red-400">
        {ended ? (
          <span className="text-slate-500 dark:text-slate-400">סיום</span>
        ) : (
          <>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            חי
          </>
        )}
      </span>

      {/* home (right in RTL) */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-end">
        <span className="truncate font-bold text-xs sm:text-sm text-slate-900 dark:text-white">{home?.name || "בית"}</span>
        <TeamLogo team={home} size={8} />
      </div>

      {/* score + clock. Score is dir=ltr away:home so RTL doesn't mispair digits
          with teams (matches the feed/milestone convention). */}
      <div className="shrink-0 flex flex-col items-center leading-none px-1">
        <span dir="ltr" className="text-lg sm:text-xl font-black tabular-nums text-slate-900 dark:text-white">
          {live.away_score ?? 0} : {live.home_score ?? 0}
        </span>
        <span className={`mt-1 font-mono text-[11px] font-bold tabular-nums ${running ? "text-red-600 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}`}>
          {ended ? (live.period || "תוצאה סופית") : clockString(remaining)}
        </span>
      </div>

      {/* away (left in RTL) */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <TeamLogo team={away} size={8} />
        <span className="truncate font-bold text-xs sm:text-sm text-slate-900 dark:text-white">{away?.name || "חוץ"}</span>
      </div>

      <ChevronLeft className="shrink-0 w-4 h-4 text-slate-400 group-hover:text-red-500 transition-colors" />
    </Link>
  )
}

export default function LiveGameBanner({ liveGames, gamesById, teamsMap, className = "" }) {
  if (!liveGames?.length) return null
  return (
    <div className={`space-y-2 ${className}`}>
      {liveGames.map(l => {
        const g = gamesById?.[l.game_id]
        return (
          <LiveRow
            key={l.game_id}
            live={l}
            home={teamsMap?.[g?.home_team_id]}
            away={teamsMap?.[g?.away_team_id]}
          />
        )
      })}
    </div>
  )
}
