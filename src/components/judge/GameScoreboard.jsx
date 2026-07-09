import { useState, useRef, useEffect } from "react"
import { Link } from "react-router-dom"
import { useGameEngine, clearEngineDraft } from "@/lib/game/useGameEngine"
import { saveGameResult } from "@/lib/judge"
import { clockString } from "@/lib/game/format"
import { Phase, TeamSide, CardType, GameRules } from "@/lib/game/rules"
import {
  Play, Pause, RotateCcw, Maximize, Minimize, X, Check, Trophy, Loader2,
  ArrowRight, Plus, Clock, ShieldAlert,
} from "lucide-react"
import TeamLogo from "@/components/TeamLogo"

const byJersey = (a, b) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999)
const toRef = (p) => ({ id: p.id, number: p.jersey_number ?? 0, name: `${p.first_name} ${p.last_name}` })
const cardMMSS = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`

export default function GameScoreboard({ game, home, guest, players }) {
  const engine = useGameEngine(game, home, guest)
  const homeRoster = players.filter(p => p.team_id === game.home_team_id).sort(byJersey)
  const guestRoster = players.filter(p => p.team_id === game.away_team_id).sort(byJersey)

  const [picker, setPicker] = useState(null) // { side, action: 'goal'|'blue'|'red' }
  const [confirmReset, setConfirmReset] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveErr, setSaveErr] = useState(null)
  const [isFs, setIsFs] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    const h = () => setIsFs(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", h)
    return () => document.removeEventListener("fullscreenchange", h)
  }, [])

  const toggleFs = async () => {
    try {
      if (document.fullscreenElement) { await document.exitFullscreen() }
      else {
        await wrapRef.current?.requestFullscreen?.()
        try { await window.screen?.orientation?.lock?.("landscape") } catch { /* not supported */ }
      }
    } catch { /* ignore */ }
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
      const homeScore = engine.home.score
      const awayScore = engine.guest.score
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
        <p className="text-sm text-slate-500 dark:text-slate-400">התוצאה {engine.guest.score}:{engine.home.score}, גיליון המשחק והטבלה עודכנו.</p>
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
        <div className="flex items-center gap-2 max-w-full">
          <TeamLogo team={team} size={8} />
          <span className="font-bold text-sm sm:text-base text-white truncate">{team?.name}</span>
        </div>
        <div className="text-6xl sm:text-7xl font-extrabold tabular-nums text-white leading-none">{s.score}</div>
        {/* timeouts + strikes */}
        <div className="flex items-center gap-3 text-[11px] text-slate-300">
          <span className="flex items-center gap-1">
            {[0, 1].map(i => (
              <span key={i} className={`w-2 h-2 rounded-full ${i < s.timeoutsThisPeriod ? "bg-slate-600" : "bg-orange-400"}`} />
            ))}
            <span className="text-slate-400">פסקי זמן</span>
          </span>
          <span className="text-slate-400">עבירות {s.strikes}</span>
        </div>
        {/* active penalty cards with live countdown */}
        <div className="flex flex-col gap-1 w-full items-center min-h-[1.5rem]">
          {cards.map(c => (
            <span key={c.id} className={`text-[11px] font-bold px-2 py-0.5 rounded ${c.type === "red" ? "bg-red-500/90 text-white" : "bg-blue-500/90 text-white"}`}>
              {c.player ? `#${c.player.number}` : "—"} · {cardMMSS(c.remainingS)}
            </span>
          ))}
        </div>
      </div>
    )
  }

  const CtrlBtn = ({ onClick, disabled, className = "", children }) => (
    <button onClick={onClick} disabled={disabled}
      className={`flex items-center justify-center gap-1 px-2.5 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-30 ${className}`}>
      {children}
    </button>
  )

  const TeamControls = ({ side }) => (
    <div className="flex flex-wrap gap-1.5 justify-center">
      <CtrlBtn onClick={() => setPicker({ side, action: "goal" })} className="bg-emerald-500 text-white hover:bg-emerald-600">⚽ שער</CtrlBtn>
      <CtrlBtn onClick={() => setPicker({ side, action: "blue" })} className="bg-blue-500 text-white hover:bg-blue-600">🟦</CtrlBtn>
      <CtrlBtn onClick={() => setPicker({ side, action: "red" })} className="bg-red-500 text-white hover:bg-red-600">🟥</CtrlBtn>
      <CtrlBtn onClick={() => engine.addStrike(side)} className="bg-slate-700 text-slate-200 hover:bg-slate-600"><ShieldAlert className="w-3.5 h-3.5" /> עבירה</CtrlBtn>
      <CtrlBtn onClick={() => engine.requestTimeout(side)} disabled={!engine.canTimeout(side) || engine.phase === Phase.ready || over}
        className="bg-slate-700 text-slate-200 hover:bg-slate-600"><Clock className="w-3.5 h-3.5" /> פסק זמן</CtrlBtn>
    </div>
  )

  return (
    <div ref={wrapRef} className={`rounded-2xl bg-slate-950 text-white ${isFs ? "fixed inset-0 z-50 rounded-none overflow-auto p-4 sm:p-6 flex flex-col justify-center" : "p-4 sm:p-6 border border-slate-800"}`}>
      {/* top bar */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-2xl font-extrabold text-orange-400">{engine.periodLabel}</span>
        <div className="flex items-center gap-2">
          {engine.settings.passivePlayEnabled && running && (
            <span className={`text-sm font-bold px-2 py-1 rounded tabular-nums ${engine.passiveIsWarning ? "bg-red-500 text-white animate-pulse" : "bg-slate-800 text-slate-300"}`}>
              מסירה {engine.passiveSeconds}
            </span>
          )}
          <button onClick={toggleFs} className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors" aria-label="מסך מלא">
            {isFs ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* scoreboard: home (right) | clock | guest (left) */}
      <div className="flex items-center gap-3 sm:gap-6">
        <TeamPanel side={TeamSide.home} />
        <div className="shrink-0 flex flex-col items-center gap-3">
          <div className={`font-mono font-extrabold tabular-nums leading-none ${showTenths ? "text-red-400" : "text-white"} text-5xl sm:text-7xl`}>
            {clockString(engine.clock.remainingMS, showTenths)}
          </div>
          <div className="flex items-center gap-2">
            {!over && (
              <button onClick={() => engine.toggleClock()} disabled={inBreak}
                className={`flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-base font-bold transition-colors disabled:opacity-40 ${running ? "bg-amber-500 hover:bg-amber-600" : "bg-emerald-500 hover:bg-emerald-600"} text-white`}>
                {running ? <><Pause className="w-5 h-5" /> עצור</> : <><Play className="w-5 h-5" /> {engine.phase === Phase.paused ? "המשך" : "התחל"}</>}
              </button>
            )}
            {inBreak && (
              <button onClick={() => engine.skipBreak()} className="px-4 py-2.5 rounded-xl bg-slate-700 text-slate-200 text-sm font-bold hover:bg-slate-600 transition-colors">דלג על ההפסקה</button>
            )}
            {engine.settings.passivePlayEnabled && running && (
              <button onClick={() => engine.resetPassive()} className="px-3 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-bold hover:bg-slate-700 transition-colors">אפס מסירה</button>
            )}
          </div>
        </div>
        <TeamPanel side={TeamSide.guest} />
      </div>

      {/* controls */}
      <div className="mt-5 pt-4 border-t border-slate-800 grid grid-cols-2 gap-4">
        <TeamControls side={TeamSide.home} />
        <TeamControls side={TeamSide.guest} />
      </div>

      {saveErr && <p className="mt-3 text-center text-sm text-red-400">{saveErr}</p>}

      {/* bottom: reset + finish */}
      <div className="mt-5 flex items-center justify-between gap-3">
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
        <button onClick={doSave} disabled={saving}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 ${over ? "bg-emerald-500 text-white hover:bg-emerald-600 animate-pulse" : "bg-white text-slate-900 hover:bg-slate-200"}`}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />} סיום ושמירת התוצאה
        </button>
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
