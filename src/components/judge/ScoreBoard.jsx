import { useState, useEffect, useRef } from "react"
import { Link } from "react-router-dom"
import { saveGameResult } from "@/lib/judge"
import { Play, Pause, RotateCcw, Plus, Minus, Check, Loader2, Trophy, AlertTriangle } from "lucide-react"
import TeamLogo from "@/components/TeamLogo"

const LS_KEY = (id) => `judge-game-${id}`
const byJersey = (a, b) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999)
const fmt = (sec) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`

function Stepper({ value, onDec, onInc, color = "text-slate-700 dark:text-slate-200", disabled }) {
  return (
    <div className="flex items-center gap-1">
      <button onClick={onDec} disabled={disabled || value === 0}
        className="w-6 h-6 rounded-md flex items-center justify-center bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-30 transition-colors">
        <Minus className="w-3 h-3" />
      </button>
      <span className={`w-5 text-center text-sm font-bold tabular-nums ${value > 0 ? color : "text-slate-300 dark:text-slate-600"}`}>{value}</span>
      <button onClick={onInc} disabled={disabled}
        className="w-6 h-6 rounded-md flex items-center justify-center bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-30 transition-colors">
        <Plus className="w-3 h-3" />
      </button>
    </div>
  )
}

export default function ScoreBoard({ game, home, away, players }) {
  const homeRoster = players.filter(p => p.team_id === game.home_team_id).sort(byJersey)
  const awayRoster = players.filter(p => p.team_id === game.away_team_id).sort(byJersey)
  const completed = game.status === "completed"

  const [stats, setStats] = useState({}) // { [playerId]: { goals, blue, red } }
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const timerRef = useRef(null)

  // restore any in-progress draft (survives a refresh mid-game)
  useEffect(() => {
    if (completed) return
    try {
      const raw = localStorage.getItem(LS_KEY(game.id))
      if (raw) { const d = JSON.parse(raw); setStats(d.stats || {}); setElapsed(d.elapsed || 0) }
    } catch { /* ignore */ }
  }, [game.id, completed])

  // persist draft
  useEffect(() => {
    if (completed || saved) return
    try { localStorage.setItem(LS_KEY(game.id), JSON.stringify({ stats, elapsed })) } catch { /* ignore */ }
  }, [stats, elapsed, completed, saved, game.id])

  // clock tick
  useEffect(() => {
    if (running) timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(timerRef.current)
  }, [running])

  const get = (pid) => stats[pid] || { goals: 0, blue: 0, red: 0 }
  const bump = (pid, key, delta) => setStats(s => {
    const cur = s[pid] || { goals: 0, blue: 0, red: 0 }
    return { ...s, [pid]: { ...cur, [key]: Math.max(0, (cur[key] || 0) + delta) } }
  })

  const homeScore = homeRoster.reduce((n, p) => n + get(p.id).goals, 0)
  const awayScore = awayRoster.reduce((n, p) => n + get(p.id).goals, 0)

  const buildStats = () => {
    const rows = []
    for (const p of [...homeRoster, ...awayRoster]) {
      const s = get(p.id)
      const conceded = p.team_id === game.home_team_id ? awayScore : homeScore
      const clean_sheet = p.position === "Goalkeeper" && conceded === 0
      if (s.goals > 0 || s.blue > 0 || s.red > 0 || clean_sheet)
        rows.push({ player_id: p.id, goals: s.goals, blue_cards: s.blue, red_cards: s.red, clean_sheet })
    }
    return rows
  }

  const finish = async () => {
    setSaving(true); setError(null)
    try {
      await saveGameResult(game.id, homeScore, awayScore, buildStats())
      setRunning(false); setSaved(true); setConfirming(false)
      try { localStorage.removeItem(LS_KEY(game.id)) } catch { /* ignore */ }
    } catch (e) {
      setError(e.message === "game already completed" ? "המשחק כבר הסתיים" : "שגיאה בשמירת המשחק")
    } finally { setSaving(false) }
  }

  if (completed) {
    return (
      <div className="card p-4 flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50">
        <Trophy className="w-5 h-5 text-emerald-500 shrink-0" />
        <p className="text-sm text-slate-600 dark:text-slate-300">המשחק הסתיים ותוצאתו נשמרה. אין אפשרות לשפוט משחק שהסתיים.</p>
      </div>
    )
  }

  if (saved) {
    return (
      <div className="card p-8 flex flex-col items-center text-center gap-3">
        <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
          <Check className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">המשחק נשמר!</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">התוצאה {awayScore}:{homeScore}, גיליון המשחק והטבלה עודכנו.</p>
        <div className="flex gap-2 mt-1">
          <Link to="/judge" className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors">חזרה לרשימה</Link>
          <Link to={`/games`} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">למשחקים</Link>
        </div>
      </div>
    )
  }

  const Row = ({ p }) => {
    const s = get(p.id)
    const isGK = p.position === "Goalkeeper"
    return (
      <div className="flex items-center gap-2 py-2 px-2 rounded-lg odd:bg-slate-50 dark:odd:bg-slate-800/40">
        <span className="w-5 text-center text-[11px] font-mono text-slate-400 dark:text-slate-500 shrink-0">{p.jersey_number ?? "–"}</span>
        <span className="flex-1 min-w-0 text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
          {p.first_name} {p.last_name}
          {isGK && <span className="text-[9px] font-bold text-blue-500 mr-1">GK</span>}
        </span>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1" title="שערים">
            <span className="text-xs">⚽</span>
            <Stepper value={s.goals} color="text-emerald-600 dark:text-emerald-400" onDec={() => bump(p.id, "goals", -1)} onInc={() => bump(p.id, "goals", 1)} />
          </div>
          <div className="flex items-center gap-1" title="כרטיס כחול">
            <span className="text-xs">🟦</span>
            <Stepper value={s.blue} color="text-blue-600 dark:text-blue-400" onDec={() => bump(p.id, "blue", -1)} onInc={() => bump(p.id, "blue", 1)} />
          </div>
          <div className="flex items-center gap-1" title="כרטיס אדום">
            <span className="text-xs">🟥</span>
            <Stepper value={s.red} color="text-red-500 dark:text-red-400" onDec={() => bump(p.id, "red", -1)} onInc={() => bump(p.id, "red", 1)} />
          </div>
        </div>
      </div>
    )
  }

  const Column = ({ team, roster, score }) => (
    <div className="card overflow-hidden">
      <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2">
        <TeamLogo team={team} size={8} />
        <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate flex-1">{team?.name || "—"}</h3>
        <span className="text-lg font-extrabold text-slate-900 dark:text-white tabular-nums">{score}</span>
      </div>
      <div className="p-1.5">
        {roster.length === 0 && <p className="text-center text-xs text-slate-400 dark:text-slate-500 py-4">אין שחקנים</p>}
        {roster.map(p => <Row key={p.id} p={p} />)}
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Clock + live score */}
      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <TeamLogo team={home} size={10} />
            <span className="font-bold text-sm text-slate-900 dark:text-white truncate">{home?.name}</span>
          </div>
          {/* RTL: away_score first, home_score last (rtl-score-gotcha) */}
          <div className="text-3xl font-extrabold tabular-nums text-slate-900 dark:text-white shrink-0 px-2">
            <span>{awayScore}</span><span className="text-slate-300 dark:text-slate-600 mx-1.5">:</span><span>{homeScore}</span>
          </div>
          <div className="flex items-center gap-2 flex-1 min-w-0 flex-row-reverse">
            <TeamLogo team={away} size={10} />
            <span className="font-bold text-sm text-slate-900 dark:text-white truncate text-left">{away?.name}</span>
          </div>
        </div>
        <div className="flex items-center justify-center gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/50">
          <span className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white">{fmt(elapsed)}</span>
          <button onClick={() => setRunning(r => !r)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${running ? "bg-amber-500 text-white hover:bg-amber-600" : "bg-emerald-500 text-white hover:bg-emerald-600"}`}>
            {running ? <><Pause className="w-3.5 h-3.5" /> השהה</> : <><Play className="w-3.5 h-3.5" /> הפעל</>}
          </button>
          <button onClick={() => { setRunning(false); setElapsed(0) }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
            <RotateCcw className="w-3.5 h-3.5" /> אפס
          </button>
        </div>
      </div>

      {/* Per-player entry */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Column team={home} roster={homeRoster} score={homeScore} />
        <Column team={away} roster={awayRoster} score={awayScore} />
      </div>

      {error && (
        <div className="card p-3 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Finish */}
      {confirming ? (
        <div className="card p-4 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800/50">
          <p className="text-sm font-semibold text-slate-900 dark:text-white text-center mb-3">
            לסיים את המשחק ולשמור? התוצאה הסופית: <span className="tabular-nums">{awayScore}:{homeScore}</span>
          </p>
          <div className="flex items-center justify-center gap-2">
            <button onClick={finish} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} כן, סיים ושמור
            </button>
            <button onClick={() => setConfirming(false)} disabled={saving}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50">
              ביטול
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => { setError(null); setConfirming(true) }}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-900 dark:bg-orange-500 text-white text-sm font-bold hover:bg-slate-800 dark:hover:bg-orange-600 transition-colors">
          <Trophy className="w-4 h-4" /> סיום משחק ושמירת התוצאה
        </button>
      )}
      <p className="text-[11px] text-center text-slate-400 dark:text-slate-500">
        התוצאה נקבעת מסך השערים של השחקנים · הנתונים נשמרים מקומית עד לסיום המשחק
      </p>
    </div>
  )
}
