import { useState, useEffect } from "react"
import { useParams } from "react-router-dom"
import { getGameById, getTeams } from "@/lib/api"
import { getLiveGame, subscribeLiveGame } from "@/lib/live"

/**
 * Sheet row 21 — אפשר לחבר לטלוויזיה עם כבל ולשדר בטלוויזיה.
 *
 * A screen built for a TV across the hall, not a phone in your hand: no nav, no menus,
 * no chrome — just the two crests, the score and the clock, sized in viewport units so
 * they scale to whatever panel is plugged in. Reached at /games/:id/tv.
 *
 * The clock is never streamed tick-by-tick. A running clock arrives as an absolute
 * deadline (`clock_ends_at`) and is counted down locally; a paused one arrives as a
 * frozen `clock_remaining_ms`. So this stays exact even on a flaky hall connection.
 */
export default function GameTv() {
  const { id } = useParams()
  const [game, setGame] = useState(null)
  const [teams, setTeams] = useState([])
  const [live, setLive] = useState(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let alive = true
    Promise.all([getGameById(id), getTeams(), getLiveGame(id)]).then(([g, t, l]) => {
      if (!alive) return
      setGame(g); setTeams(t); setLive(l)
    }).catch(() => {})
    const unsub = subscribeLiveGame(id, row => setLive(row))
    return () => { alive = false; unsub?.() }
  }, [id])

  // Local tick for the countdown. 250ms is plenty for a seconds display and keeps a
  // TV that may be left on all evening from doing needless work.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [])

  // Keep the panel awake — a scoreboard that sleeps mid-game is useless.
  useEffect(() => {
    let lock = null
    navigator.wakeLock?.request("screen").then(l => { lock = l }).catch(() => {})
    return () => { lock?.release?.().catch(() => {}) }
  }, [])

  const teamsMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const home = game ? teamsMap[game.home_team_id] : null
  const away = game ? teamsMap[game.away_team_id] : null

  const remainingMS = live?.is_running && live?.clock_ends_at
    ? Math.max(0, new Date(live.clock_ends_at).getTime() - now)
    : Math.max(0, live?.clock_remaining_ms ?? 0)
  const mm = String(Math.floor(remainingMS / 60000)).padStart(2, "0")
  const ss = String(Math.floor((remainingMS % 60000) / 1000)).padStart(2, "0")

  const homeScore = live?.home_score ?? game?.home_score ?? 0
  const awayScore = live?.away_score ?? game?.away_score ?? 0

  if (!game) {
    return <div className="fixed inset-0 z-[100] bg-[#0E2350] flex items-center justify-center text-white/60 text-2xl">טוען…</div>
  }

  // Each side is its own element, so the digits never reorder against the RTL layout.
  const Side = ({ team, score }) => (
    <div className="flex-1 min-w-0 flex flex-col items-center gap-[2vh]">
      {team?.logo_url
        ? <img src={team.logo_url} alt="" className="h-[16vh] w-[16vh] object-contain" />
        : <div className="h-[16vh]" />}
      <p className="text-[4vh] font-bold text-white/80 truncate max-w-full px-2">{team?.name || "—"}</p>
      <p className="text-[22vh] leading-none font-extrabold text-white tabular-nums">{score}</p>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[100] bg-[#0E2350] flex flex-col items-center justify-center select-none overflow-hidden">
      <div className="w-full flex items-center justify-center gap-[4vw] px-[3vw]">
        <Side team={home} score={homeScore} />
        <div className="flex flex-col items-center gap-[1vh] shrink-0">
          <p className="text-[14vh] leading-none font-extrabold text-white tabular-nums" dir="ltr">
            {mm}:{ss}
          </p>
          {live?.period && (
            <p className="text-[4vh] font-bold text-white/70">{live.period}</p>
          )}
          {live && !live.is_running && (
            <p className="text-[3vh] font-bold text-amber-400">עצור</p>
          )}
        </div>
        <Side team={away} score={awayScore} />
      </div>

      {!live && (
        <p className="absolute bottom-[4vh] text-[2.5vh] text-white/40">המשחק אינו משודר כרגע</p>
      )}
    </div>
  )
}
