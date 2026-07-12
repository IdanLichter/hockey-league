import { useState, useRef, useEffect } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useGameEngine, clearEngineDraft } from "@/lib/game/useGameEngine"
import { saveGameResult } from "@/lib/judge"
import { broadcastGameState, setGameStatus } from "@/lib/live"
import { clockString } from "@/lib/game/format"
import { Phase, TeamSide, CardType } from "@/lib/game/rules"
import {
  Play, Pause, RotateCcw, Maximize, Minimize, X, Check, Trophy, Loader2,
  Undo2, Goal, RectangleVertical, ShieldAlert, Timer,
} from "lucide-react"
import TeamLogo from "@/components/TeamLogo"

const byJersey = (a, b) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999)
const toRef = (p) => ({ id: p.id, number: p.jersey_number ?? 0, name: `${p.first_name} ${p.last_name}` })
const cardMMSS = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`

export default function GameScoreboard({ game, home, guest, players }) {
  const engine = useGameEngine(game, home, guest)
  const homeRoster = players.filter(p => p.team_id === game.home_team_id).sort(byJersey)
  const guestRoster = players.filter(p => p.team_id === game.away_team_id).sort(byJersey)
  // What gets persisted: match aggregate, not the on-screen per-period score.
  const homeScore = engine.homeFinalScore
  const awayScore = engine.guestFinalScore

  const navigate = useNavigate()
  const [picker, setPicker] = useState(null) // { side, action: 'goal'|'blue'|'red' }
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [confirmAbandon, setConfirmAbandon] = useState(false)
  const [abandoning, setAbandoning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveErr, setSaveErr] = useState(null)
  const [isFs, setIsFs] = useState(false)
  // Immersive, full-viewport judge board (in-app overlay) — the default, so the
  // web board matches the native app's full-screen scoreboard. `isFs` is the
  // browser Fullscreen API (kiosk) layered on top; either makes the board `full`.
  const [immersive, setImmersive] = useState(true)
  const wrapRef = useRef(null)
  const full = immersive || isFs

  useEffect(() => {
    const h = () => setIsFs(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", h)
    return () => document.removeEventListener("fullscreenchange", h)
  }, [])

  // Live broadcast to spectators. The engine bumps `version` ~20×/sec while the
  // clock runs, but we only push a new snapshot when a SIGNIFICANT thing changes
  // — score, running/paused, phase or period — never per tick (spectators
  // reconstruct the clock from the broadcast deadline). A completed game is never
  // re-opened. One broadcast on mount makes the game show live the moment the
  // judge opens the board.
  const lastSig = useRef(null)
  useEffect(() => {
    if (game.status === "completed") return
    const sig = () => [
      engine.homeFinalScore, engine.guestFinalScore,
      engine.isRunning, engine.phase, engine.periodLabel,
    ].join("|")
    lastSig.current = sig()
    broadcastGameState(engine, game.id)
    return engine.subscribe(() => {
      const s = sig()
      if (s === lastSig.current) return
      lastSig.current = s
      broadcastGameState(engine, game.id)
    })
  }, [engine, game.id, game.status])

  // Abandon: hand the game back to "not started". Clears the DB live state
  // (server-side) and the local draft, then returns to the judge list.
  const doAbandon = async () => {
    setAbandoning(true); setSaveErr(null)
    try {
      await setGameStatus(game.id, "scheduled")
      clearEngineDraft(game.id)
      navigate("/judge")
    } catch {
      setSaveErr("שגיאה בהחזרת המשחק למצב 'טרם החל'")
      setAbandoning(false)
    }
  }

  // Kiosk fullscreen (browser Fullscreen API) — hides the browser chrome on top
  // of the immersive layout, and locks landscape where supported.
  const toggleFs = async () => {
    try {
      if (document.fullscreenElement) { await document.exitFullscreen() }
      else {
        await wrapRef.current?.requestFullscreen?.()
        try { await window.screen?.orientation?.lock?.("landscape") } catch { /* not supported */ }
      }
    } catch { /* ignore */ }
  }

  const exitImmersive = async () => {
    if (document.fullscreenElement) { try { await document.exitFullscreen() } catch { /* ignore */ } }
    setImmersive(false)
  }

  const roster = (side) => (side === TeamSide.home ? homeRoster : guestRoster)

  const pick = (p) => {
    if (!picker) return
    const ref = p ? toRef(p) : null
    if (picker.action === "goal") engine.addGoal(picker.side, ref)
    else engine.addCard(picker.side, ref, picker.action === "red" ? CardType.red : CardType.blue)
    setPicker(null)
  }

  const doSave = async () => {
    setSaving(true); setSaveErr(null)
    try {
      const map = new Map(engine.boxScore().map(r => [r.player_id, { clean_sheet: false, ...r }]))
      for (const p of [...homeRoster, ...guestRoster]) {
        if (p.position !== "Goalkeeper") continue
        const conceded = p.team_id === game.home_team_id ? awayScore : homeScore
        const cs = conceded === 0
        if (!map.has(p.id) && !cs) continue
        const r = map.get(p.id) || { player_id: p.id, goals: 0, blue_cards: 0, red_cards: 0, clean_sheet: false }
        r.clean_sheet = cs
        map.set(p.id, r)
      }
      await saveGameResult(game.id, homeScore, awayScore, [...map.values()])
      clearEngineDraft(game.id)
      setSaved(true)
    } catch (e) {
      setSaveErr(e.message === "game already completed" ? "המשחק כבר הסתיים" : "שגיאה בשמירת התוצאה")
    } finally { setSaving(false) }
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
          <Link to="/games" className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">למשחקים</Link>
        </div>
      </div>
    )
  }

  const over = engine.phase === Phase.over
  const running = engine.phase === Phase.running
  const inBreak = engine.phase === Phase.breakTime
  const showTenths = engine.clock.showTenths

  const TeamPanel = ({ side }) => {
    const s = engine._side(side)
    const team = side === TeamSide.home ? home : guest
    const cards = engine.activeCards(side)
    return (
      <div className="flex-1 min-w-0 flex flex-col items-center gap-2">
        <div className="flex flex-col items-center gap-1.5">
          <TeamLogo team={team} size={full ? 14 : 10} />
          <span className={`font-bold text-white text-center leading-tight line-clamp-2 ${full ? "text-sm sm:text-lg" : "text-sm"}`}>{team?.name}</span>
        </div>
        <div className={`font-extrabold tabular-nums text-white leading-none ${full ? "text-[clamp(1.75rem,min(12vw,16vh),8rem)]" : "text-6xl sm:text-7xl"}`}>{s.score}</div>
        {/* timeouts + strikes */}
        <div className={`flex items-center gap-3 text-slate-300 ${full ? "text-xs sm:text-sm" : "text-[11px]"}`}>
          <span className="flex items-center gap-1.5">
            {[0, 1].map(i => (
              <span key={i} className={`rounded-full ${full ? "w-2.5 h-2.5" : "w-2 h-2"} ${i < s.timeoutsThisPeriod ? "bg-slate-600" : "bg-orange-400"}`} />
            ))}
            <span className="text-slate-400">פסקי זמן</span>
          </span>
          <span className="text-slate-400">עבירות <span className="font-bold text-slate-200 tabular-nums">{s.strikes}</span></span>
        </div>
        {/* active penalty cards with live countdown */}
        <div className="flex flex-col gap-1 w-full items-center min-h-[1.5rem]">
          {cards.map(c => (
            <span key={c.id} className={`font-bold px-2 py-0.5 rounded ${full ? "text-xs sm:text-sm" : "text-[11px]"} ${c.type === "red" ? "bg-red-500/90 text-white" : "bg-blue-500/90 text-white"}`}>
              {c.player ? `#${c.player.number}` : "—"} · {cardMMSS(c.remainingS)}
            </span>
          ))}
        </div>
      </div>
    )
  }

  // A small square action button (card / foul / timeout): icon over label.
  const MiniCtrl = ({ onClick, disabled, className = "", icon: Icon, label }) => (
    <button onClick={onClick} disabled={disabled}
      className={`flex flex-col items-center justify-center gap-0.5 rounded-lg font-bold transition-colors disabled:opacity-30 ${full ? "py-2.5 text-[13px]" : "py-2 text-[11px]"} ${className}`}>
      <Icon className={full ? "w-5 h-5" : "w-4 h-4"} />
      <span className="leading-tight">{label}</span>
    </button>
  )

  const TeamControls = ({ side }) => (
    <div className="flex flex-col gap-2">
      {/* Goal is the primary, most-used action — full-width and prominent. */}
      <button onClick={() => setPicker({ side, action: "goal" })}
        className={`flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold transition-colors ${full ? "py-3 text-lg" : "py-2.5 text-base"}`}>
        <Goal className={full ? "w-6 h-6" : "w-5 h-5"} /> שער
      </button>
      <div className="grid grid-cols-4 gap-1.5">
        <MiniCtrl onClick={() => setPicker({ side, action: "blue" })} icon={RectangleVertical} label="כחול" className="bg-blue-500 text-white hover:bg-blue-600" />
        <MiniCtrl onClick={() => setPicker({ side, action: "red" })} icon={RectangleVertical} label="אדום" className="bg-red-600 text-white hover:bg-red-700" />
        <MiniCtrl onClick={() => engine.addStrike(side)} icon={ShieldAlert} label="עבירה" className="bg-slate-700 text-slate-200 hover:bg-slate-600" />
        <MiniCtrl onClick={() => engine.requestTimeout(side)} disabled={!engine.canTimeout(side) || engine.phase === Phase.ready || over}
          icon={Timer} label="פסק זמן" className="bg-slate-700 text-slate-200 hover:bg-slate-600" />
      </div>
    </div>
  )

  return (
    <div
      ref={wrapRef}
      className={`bg-slate-950 text-white flex flex-col ${full ? "fixed inset-0 z-50 gap-3 p-3 sm:p-5 overflow-y-auto" : "rounded-2xl border border-slate-800 gap-4 p-4 sm:p-6"}`}
    >
      {/* top bar: period · passive · fullscreen / exit */}
      <div className="flex items-center justify-between gap-2 shrink-0">
        <span className={`font-extrabold text-orange-400 ${full ? "text-2xl sm:text-3xl" : "text-2xl"}`}>{engine.periodLabel}</span>
        <div className="flex items-center gap-2">
          {engine.settings.passivePlayEnabled && running && (
            <span className={`font-bold px-2 py-1 rounded tabular-nums ${full ? "text-sm sm:text-base" : "text-sm"} ${engine.passiveIsWarning ? "bg-red-500 text-white animate-pulse" : "bg-slate-800 text-slate-300"}`}>
              מסירה {engine.passiveSeconds}
            </span>
          )}
          {full ? (
            <>
              <button onClick={toggleFs} className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors" aria-label="מסך מלא (קיוסק)">
                {isFs ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </button>
              <button onClick={exitImmersive} className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors" aria-label="צא ממסך מלא">
                <X className="w-5 h-5" />
              </button>
            </>
          ) : (
            <button onClick={() => setImmersive(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors text-sm font-bold" aria-label="מסך שיפוט">
              <Maximize className="w-4 h-4" /> מסך שיפוט
            </button>
          )}
        </div>
      </div>

      {/* scoreboard: home (right) | clock | guest (left) */}
      <div className={full ? "shrink-0" : ""}>
        <div className="w-full flex items-center justify-center gap-3 sm:gap-6">
          <TeamPanel side={TeamSide.home} />
          <div className="shrink-0 flex flex-col items-center gap-3">
            <div className={`font-mono font-extrabold tabular-nums leading-none ${showTenths ? "text-red-400" : "text-white"} ${full ? "text-[clamp(2.25rem,min(16vw,20vh),9rem)]" : "text-6xl sm:text-7xl"}`}>
              {clockString(engine.clock.remainingMS, showTenths)}
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {!over && (
                <button onClick={() => engine.toggleClock()} disabled={inBreak}
                  className={`flex items-center gap-2 rounded-2xl font-extrabold transition-colors disabled:opacity-40 text-white ${running ? "bg-amber-500 hover:bg-amber-600" : "bg-emerald-500 hover:bg-emerald-600"} ${full ? "px-8 py-3 text-xl" : "px-5 py-2.5 text-base"}`}>
                  {running ? <><Pause className={full ? "w-6 h-6" : "w-5 h-5"} /> עצור</> : <><Play className={full ? "w-6 h-6" : "w-5 h-5"} /> {engine.phase === Phase.paused ? "המשך" : "התחל"}</>}
                </button>
              )}
              {inBreak && (
                <button onClick={() => engine.skipBreak()} className={`rounded-xl bg-slate-700 text-slate-200 font-bold hover:bg-slate-600 transition-colors ${full ? "px-5 py-4 text-base" : "px-4 py-2.5 text-sm"}`}>דלג על ההפסקה</button>
              )}
              {engine.settings.passivePlayEnabled && running && (
                <button onClick={() => engine.resetPassive()} className={`rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 transition-colors ${full ? "px-4 py-4 text-base" : "px-3 py-2.5 text-sm"}`}>אפס מסירה</button>
              )}
            </div>
          </div>
          <TeamPanel side={TeamSide.guest} />
        </div>
      </div>

      {/* controls */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 shrink-0 pt-3 border-t border-slate-800">
        <TeamControls side={TeamSide.home} />
        <TeamControls side={TeamSide.guest} />
      </div>

      {saveErr && <p className="text-center text-sm text-red-400 shrink-0">{saveErr}</p>}

      {/* bottom: reset + abandon (left) | finish (right) */}
      <div className={`flex items-center justify-between gap-3 shrink-0 ${full ? "mt-auto" : ""}`}>
        <div className="flex items-center gap-2 flex-wrap">
          {confirmReset ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">לאפס את המשחק?</span>
              <button onClick={() => { engine.resetGame(); setConfirmReset(false) }} className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-bold">כן, אפס</button>
              <button onClick={() => setConfirmReset(false)} className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-300 text-xs font-bold">ביטול</button>
            </div>
          ) : (
            <button onClick={() => setConfirmReset(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-slate-400 hover:bg-slate-800 transition-colors">
              <RotateCcw className="w-3.5 h-3.5" /> אפס משחק
            </button>
          )}
          {confirmAbandon ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">להחזיר את המשחק למצב "טרם החל"?</span>
              <button onClick={doAbandon} disabled={abandoning}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-bold disabled:opacity-50">
                {abandoning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} כן, החזר
              </button>
              <button onClick={() => setConfirmAbandon(false)} disabled={abandoning} className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-300 text-xs font-bold disabled:opacity-50">ביטול</button>
            </div>
          ) : (
            <button onClick={() => { setSaveErr(null); setConfirmAbandon(true) }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-slate-400 hover:bg-slate-800 transition-colors">
              <Undo2 className="w-3.5 h-3.5" /> החזר למצב 'טרם החל'
            </button>
          )}
        </div>
        {confirmFinish ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-300">לסיים ולשמור? <span className="font-bold tabular-nums">{awayScore}:{homeScore}</span></span>
            <button onClick={doSave} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 transition-colors disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} כן, סיים ושמור
            </button>
            <button onClick={() => setConfirmFinish(false)} disabled={saving}
              className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 text-sm font-bold hover:bg-slate-800 transition-colors disabled:opacity-50">ביטול</button>
          </div>
        ) : (
          <button onClick={() => { setSaveErr(null); setConfirmFinish(true) }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors ${over ? "bg-emerald-500 text-white hover:bg-emerald-600 animate-pulse" : "bg-white text-slate-900 hover:bg-slate-200"}`}>
            <Trophy className="w-4 h-4" /> סיום ושמירת התוצאה
          </button>
        )}
      </div>

      {/* player picker */}
      {picker && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={() => setPicker(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
              <h4 className="font-bold text-sm text-white">
                {picker.action === "goal" ? "שער עבור" : picker.action === "red" ? "כרטיס אדום עבור" : "כרטיס כחול עבור"} · {(picker.side === TeamSide.home ? home : guest)?.name}
              </h4>
              <button onClick={() => setPicker(null)} className="p-1 rounded text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-2 overflow-y-auto">
              {roster(picker.side).map(p => (
                <button key={p.id} onClick={() => pick(p)}
                  className={`w-full flex items-center gap-2 py-2 px-3 rounded-lg text-sm text-right hover:bg-slate-800 transition-colors ${engine.isEjected(p.id) ? "opacity-40" : ""}`}>
                  <span className="w-6 text-center text-[11px] font-mono text-slate-500">{p.jersey_number ?? "–"}</span>
                  <span className="flex-1 text-white truncate">{p.first_name} {p.last_name}</span>
                  {p.position === "Goalkeeper" && <span className="text-[9px] font-bold text-blue-400">GK</span>}
                  {engine.isEjected(p.id) && <span className="text-[9px] font-bold text-red-400">הורחק</span>}
                </button>
              ))}
              {picker.action === "goal" && (
                <button onClick={() => pick(null)} className="w-full py-2 px-3 rounded-lg text-sm text-slate-400 hover:bg-slate-800 transition-colors">ללא שיוך לשחקן</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
