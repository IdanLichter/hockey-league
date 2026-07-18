import { useState, useRef, useEffect } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useGameEngine, clearEngineDraft } from "@/lib/game/useGameEngine"
import { saveGameResult } from "@/lib/judge"
import { getGameAvailabilityForOfficial } from "@/lib/availability"
import { broadcastGameState, setGameStatus } from "@/lib/live"
import { clockString } from "@/lib/game/format"
import { Phase, TeamSide, CardType, GameFormat } from "@/lib/game/rules"
import {
  RotateCcw, Pencil, CheckCircle2, Megaphone, Settings as SettingsIcon, Paintbrush,
  Hand, RectangleVertical, SkipForward, Save, Undo2, Plus, Minus, X, Maximize, Minimize,
  Loader2, Check,
} from "lucide-react"
import { StickBall } from "@/components/icons/HockeyIcons"

/* ============================================================================
 * Web judge scoreboard — a faithful mirror of the iOS `ScoreboardView`.
 *   • Home on the LEFT (board pinned LTR), guest on the right.
 *   • Tap the CLOCK to start/pause (or skip a break).
 *   • Tap a team's SCORE to add a goal (picker); LONG-PRESS to undo the last.
 *   • Tap FOULS to add; long-press to undo. Long-press a card pill to remove it.
 *   • Bottom control bar: reset (double-tap) · edit · buzzer · settings · theme.
 * Web-only bits (live broadcast, judge save, abandon, kiosk fullscreen) are kept.
 * ==========================================================================*/

const byJersey = (a, b) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999)
const toRef = (p) => ({ id: p.id, number: p.jersey_number ?? 0, name: `${p.first_name} ${p.last_name}` })
const cardMMSS = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
const HOLD_MS = 400
const TOUCH = { touchAction: "manipulation", userSelect: "none", WebkitUserSelect: "none", cursor: "pointer" }

const HE = {
  fouls: "עבירות", timeout: "פסק זמן",
  tapToStart: "הקש על השעון כדי להתחיל", paused: "מושהה",
  namePlaceholder: "שם", minutes: "דק׳", seconds: "שנ׳",
  pickScorer: "מי הבקיע?", pickCarded: "כרטיס עבור", skipBreak: "דלג על ההפסקה",
  settings: "הגדרות", format: "פורמט משחק", formatHalves: "שתי מחציות", formatThirds: "שלישים",
  periodLength: "אורך מחצית", overtime: "הארכה בתיקו", breakLength: "אורך מנוחה",
  passivePlay: "שעון משחק פסיבי", theme: "ערכת נושא", themeLed: "LED / זירה", themeModern: "מודרני",
  resetGame: "אפס משחק", done: "סיום", cancel: "ביטול", noPlayer: "ללא שיוך לשחקן",
  saveResult: "שמור תוצאה", abandon: "החזר למצב 'טרם החל'",
  abandonConfirm: "להחזיר את המשחק למצב 'טרם החל'?", abandonYes: "כן, החזר",
}

/* LED jumbotron + Modern — ported 1:1 from iOS Theme.swift presets. */
const THEMES = {
  led: {
    bg: "#080a0f", panel: "#12141c", primaryText: "#ffffff", secondaryText: "rgba(255,255,255,0.55)",
    clock: "#ff2121", clockGlow: "#ff3333", glowRadius: 18, homeAccent: "#00f2ff", guestAccent: "#ffb800",
    score: "#ffffff", strike: "#f7ed00", cardBlue: "#00a1ff", cardRed: "#f00000",
    passive: "#33f28c", passiveWarning: "#00f2ff", controlTint: "rgba(255,255,255,0.85)", accent: "#00f2ff",
  },
  modern: {
    bg: "#0b0f19", panel: "#1a2030", primaryText: "#ffffff", secondaryText: "rgba(255,255,255,0.6)",
    clock: "#ffffff", clockGlow: "transparent", glowRadius: 0, homeAccent: "#3b82f6", guestAccent: "#f59e0b",
    score: "#ffffff", strike: "#facc15", cardBlue: "#3b82f6", cardRed: "#ef4444",
    passive: "#22c55e", passiveWarning: "#f59e0b", controlTint: "#ffffff", accent: "#f97316",
  },
}

// One shared AudioContext for the buzzer — different tone per buzz kind, mirroring
// the iOS BuzzerPlayer so a judge hears goals vs. foul penalties.
let _actx = null
function beep(kind) {
  try {
    _actx = _actx || new (window.AudioContext || window.webkitAudioContext)()
    const ctx = _actx
    const freq = kind === "teamFoulPenalty" ? 880 : kind === "teamFoulWarning" ? 660
      : kind === "goal" ? 520 : kind === "card" ? 380 : 700
    const dur = kind === "teamFoulPenalty" ? 0.55 : (kind === "periodEnd" || kind === "gameEnd") ? 0.7 : 0.18
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.type = "square"; o.frequency.value = freq
    g.gain.setValueAtTime(0.12, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
    o.connect(g); g.connect(ctx.destination)
    o.start(); o.stop(ctx.currentTime + dur)
  } catch { /* audio unavailable — non-critical */ }
}

// Tap vs. long-press on one element (add on tap, undo on hold) — the iOS
// onTapGesture + onLongPressGesture model. Suppresses the tap after a hold fires.
function useHold(onTap, onHold, ms = HOLD_MS) {
  const timer = useRef(null)
  const held = useRef(false)
  const start = () => { held.current = false; timer.current = setTimeout(() => { held.current = true; onHold?.() }, ms) }
  const cancel = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }
  return {
    onPointerDown: start,
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onClick: () => { if (!held.current) onTap?.() },
    onContextMenu: (e) => e.preventDefault(),
  }
}

/* ---------- one active penalty-card pill (hold to remove) ---------- */
function CardPill({ card, T, onRemove }) {
  const hold = useHold(undefined, onRemove)
  return (
    <span {...hold} style={{ ...TOUCH, background: card.type === CardType.red ? T.cardRed : T.cardBlue }}
      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-[12px] font-bold" title="החזק כדי לבטל">
      {card.player?.number != null && <span className="tabular-nums">#{card.player.number}</span>}
      <span className="tabular-nums">{cardMMSS(card.remainingS)}</span>
    </span>
  )
}

/* ---------- team column (name · score · fouls · cards · timeout) ---------- */
function TeamColumn({ side, engine, T, teamName, setPicker }) {
  const s = engine._side(side)
  const editing = engine.phase === Phase.editing
  const accent = side === TeamSide.home ? T.homeAccent : T.guestAccent
  const scoreHold = useHold(() => setPicker({ side, kind: "goal" }), () => engine.removeGoal(side))
  const foulHold = useHold(() => engine.addStrike(side, null), () => engine.removeStrike(side))
  const displayScore = side === TeamSide.home ? engine.homeDisplayScore : engine.guestDisplayScore
  const cards = engine.activeCards(side)

  return (
    <div className="flex flex-col items-center gap-2 sm:gap-3 w-[27%] shrink-0">
      {editing ? (
        <input value={s.name} onChange={(e) => { engine._side(side).name = e.target.value; engine._changed() }} placeholder={HE.namePlaceholder}
          className="w-full text-center rounded-lg px-2 py-1 text-lg font-bold bg-black/30 border outline-none"
          style={{ color: accent, borderColor: "rgba(255,255,255,0.2)" }} />
      ) : (
        <div className="font-extrabold text-center leading-tight line-clamp-1 text-[clamp(1.1rem,2.4vw,2.25rem)]" style={{ color: accent }}>{teamName || s.name}</div>
      )}

      {/* score — tap to add (picker), hold to undo */}
      <div {...scoreHold} style={{ ...TOUCH, color: T.score, textShadow: T.glowRadius ? `0 0 14px ${accent}aa` : "none" }}
        className="font-black tabular-nums leading-none text-[clamp(3.5rem,12vw,9rem)]" aria-label={`${s.name} ${s.score}`}>
        {displayScore}
      </div>

      {/* fouls — tap to add, hold to undo */}
      <div {...foulHold} style={TOUCH} className="flex flex-col items-center leading-none">
        <span className="font-black tabular-nums text-[clamp(1.75rem,5vw,3.5rem)]" style={{ color: T.strike }}>{s.strikes}</span>
        <span className="text-[11px] font-semibold tracking-widest" style={{ color: T.secondaryText }}>{HE.fouls}</span>
      </div>

      {/* cards — blue/red add (picker) + active countdowns (hold to remove) */}
      <div className="flex items-center justify-center gap-2 flex-wrap min-h-[2.25rem]">
        <button onClick={() => setPicker({ side, kind: "blue" })} className="w-10 h-10 flex items-center justify-center" aria-label="כרטיס כחול">
          <RectangleVertical className="w-6 h-6" style={{ color: T.cardBlue }} fill="currentColor" />
        </button>
        <button onClick={() => setPicker({ side, kind: "red" })} className="w-10 h-10 flex items-center justify-center" aria-label="כרטיס אדום">
          <RectangleVertical className="w-6 h-6" style={{ color: T.cardRed }} fill="currentColor" />
        </button>
        {cards.map(c => <CardPill key={c.id} card={c} T={T} onRemove={() => engine.removeCard(c.id)} />)}
      </div>

      {/* timeout */}
      <button onClick={() => engine.requestTimeout(side)} disabled={!engine.canTimeout(side)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold transition-opacity"
        style={{ background: T.panel, color: accent, opacity: engine.canTimeout(side) ? 1 : 0.25 }}>
        <Hand className="w-3.5 h-3.5" /> {HE.timeout}
      </button>
    </div>
  )
}

function ControlBtn({ icon: Icon, onClick, tint, label, fill = false }) {
  return (
    <button onClick={onClick} aria-label={label} className="w-11 h-11 flex items-center justify-center">
      <Icon className="w-6 h-6" style={{ color: tint }} fill={fill ? "currentColor" : "none"} />
    </button>
  )
}

export default function GameScoreboard({ game, home, guest, players }) {
  const engine = useGameEngine(game, home, guest)
  const [attendingIds, setAttendingIds] = useState(null) // Set of confirmed player_ids; null until loaded
  const [showAllRoster, setShowAllRoster] = useState(false)
  // C4: default the roster to confirmed attendees; the judge can switch to the full
  // squad. GK clean-sheet detection always uses the FULL roster (see doSave).
  const fullHomeRoster = players.filter(p => p.team_id === game.home_team_id).sort(byJersey)
  const fullGuestRoster = players.filter(p => p.team_id === game.away_team_id).sort(byJersey)
  const useAttending = !showAllRoster && attendingIds && attendingIds.size > 0
  const homeRoster = useAttending ? fullHomeRoster.filter(p => attendingIds.has(p.id)) : fullHomeRoster
  const guestRoster = useAttending ? fullGuestRoster.filter(p => attendingIds.has(p.id)) : fullGuestRoster
  const homeScore = engine.homeFinalScore
  const awayScore = engine.guestFinalScore

  const navigate = useNavigate()
  const [picker, setPicker] = useState(null)      // { side, kind: 'goal'|'blue'|'red' }
  const [themeKind, setThemeKind] = useState("led")
  const [resetArmed, setResetArmed] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [confirmAbandon, setConfirmAbandon] = useState(false)
  const [abandoning, setAbandoning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveErr, setSaveErr] = useState(null)
  const [isFs, setIsFs] = useState(false)
  const [immersive, setImmersive] = useState(true)
  const wrapRef = useRef(null)
  const full = immersive || isFs
  const T = THEMES[themeKind]

  useEffect(() => {
    const h = () => setIsFs(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", h)
    return () => document.removeEventListener("fullscreenchange", h)
  }, [])

  // Load who confirmed attendance → default the player picker to attendees (C4).
  useEffect(() => {
    let alive = true
    getGameAvailabilityForOfficial(game.id).then(rows => {
      if (alive) setAttendingIds(new Set(rows.filter(r => r.status === "available").map(r => r.player_id)))
    }).catch(() => { if (alive) setAttendingIds(new Set()) })
    return () => { alive = false }
  }, [game.id])

  // Buzzer sound on every engine buzz (goal / card / foul / manual / period-end).
  const lastBuzz = useRef(-1)
  useEffect(() => {
    const seq = engine.buzzSeq ?? 0
    if (lastBuzz.current === -1) { lastBuzz.current = seq; return }
    if (seq !== lastBuzz.current) { lastBuzz.current = seq; beep(engine.lastBuzzKind) }
  }, [engine.buzzSeq, engine.lastBuzzKind])

  // Live broadcast — one push on mount, then only on the significant signature
  // (score / running / phase / period); never per clock tick.
  const lastSig = useRef(null)
  useEffect(() => {
    if (game.status === "completed") return
    // Event counts are in the signature so a card/foul (which changes neither score
    // nor phase) still pushes a broadcast — that's what carries the play-by-play.
    const sig = () => [engine.homeFinalScore, engine.guestFinalScore, engine.isRunning, engine.phase, engine.periodLabel, engine.goals.length, engine.strikes.length, engine.cardLog.length, engine.breaks.length].join("|")
    lastSig.current = sig()
    // Skip broadcasting an untouched board: it would flip the game to "live" and
    // overwrite an existing live row (including a snapshot we might still recover
    // from) before the judge acts. The first real change broadcasts via subscribe.
    if (!engine.isPristine()) broadcastGameState(engine, game.id)
    return engine.subscribe(() => {
      const s = sig()
      if (s === lastSig.current) return
      lastSig.current = s
      broadcastGameState(engine, game.id)
    })
  }, [engine, game.id, game.status])

  // Heartbeat: while the clock is running, re-broadcast every 10s so `updated_at`
  // stays fresh. If the judge disconnects (tab closed / phone dead), the heartbeat
  // stops and spectators freeze the clock ("ממתין לשופט") instead of it running
  // down to 0 with nobody officiating (see LiveGame.jsx judgeGone()).
  useEffect(() => {
    if (game.status === "completed" || !engine.isRunning) return
    const iv = setInterval(() => broadcastGameState(engine, game.id), 10000)
    return () => clearInterval(iv)
  }, [engine, engine.isRunning, game.id, game.status])

  const doAbandon = async () => {
    setAbandoning(true); setSaveErr(null)
    try {
      await setGameStatus(game.id, "scheduled")
      clearEngineDraft(game.id)
      navigate("/judge")
    } catch { setSaveErr("שגיאה בהחזרת המשחק למצב 'טרם החל'"); setAbandoning(false) }
  }

  const toggleFs = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else {
        await wrapRef.current?.requestFullscreen?.()
        try { await window.screen?.orientation?.lock?.("landscape") } catch { /* unsupported */ }
      }
    } catch { /* ignore */ }
  }
  const exitImmersive = async () => {
    if (document.fullscreenElement) { try { await document.exitFullscreen() } catch { /* ignore */ } }
    setImmersive(false)
  }

  const rosterFor = (side) => (side === TeamSide.home ? homeRoster : guestRoster)
  const resolvePick = (p) => {
    if (!picker) return
    const ref = p ? toRef(p) : null
    if (picker.kind === "goal") engine.addGoal(picker.side, ref)
    else engine.addCard(picker.side, ref, picker.kind === "red" ? CardType.red : CardType.blue)
    setPicker(null)
  }

  const handleReset = () => {
    if (resetArmed) { setResetArmed(false); engine.resetGame() }
    else { setResetArmed(true); setTimeout(() => setResetArmed(false), 1200) }
  }
  const updateSettings = (patch) => { Object.assign(engine.settings, patch); engine._changed() }

  const doSave = async () => {
    setSaving(true); setSaveErr(null)
    try {
      const map = new Map(engine.boxScore().map(r => [r.player_id, { clean_sheet: false, ...r }]))
      for (const p of [...fullHomeRoster, ...fullGuestRoster]) {
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
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 text-center p-8" style={{ background: T.bg, color: T.primaryText }} dir="rtl">
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(52,242,140,0.15)" }}>
          <Check className="w-8 h-8" style={{ color: T.passive }} />
        </div>
        <h3 className="text-xl font-extrabold">המשחק נשמר!</h3>
        <p className="text-sm" style={{ color: T.secondaryText }}>התוצאה {awayScore}:{homeScore} · הטבלה עודכנה.</p>
        <div className="flex gap-2 mt-1">
          <Link to="/judge" className="px-4 py-2 rounded-lg text-sm font-bold text-white" style={{ background: T.accent }}>חזרה לרשימה</Link>
          <Link to="/games" className="px-4 py-2 rounded-lg text-sm font-bold" style={{ background: T.panel, color: T.primaryText }}>למשחקים</Link>
        </div>
      </div>
    )
  }

  const over = engine.phase === Phase.over
  const editing = engine.phase === Phase.editing
  const inBreak = engine.phase === Phase.breakTime
  const showTenths = engine.clock.showTenths

  return (
    <div ref={wrapRef} dir="ltr"
      className={full ? "fixed inset-0 z-50 flex flex-col overflow-hidden" : "rounded-2xl overflow-hidden"}
      style={{ background: T.bg, color: T.primaryText }}>

      {/* subtle web-only chrome: exit + kiosk fullscreen (top-left in LTR) */}
      {full ? (
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 opacity-40 hover:opacity-100 transition-opacity">
          <button onClick={exitImmersive} aria-label="צא" className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: T.panel }}><X className="w-5 h-5" /></button>
          <button onClick={toggleFs} aria-label="מסך מלא" className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: T.panel }}>{isFs ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}</button>
        </div>
      ) : (
        <button onClick={() => setImmersive(true)} className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold" style={{ background: T.panel, color: T.primaryText }}>
          <Maximize className="w-4 h-4" /> מסך שיפוט
        </button>
      )}

      {/* board: HOME (left) · center · GUEST (right) */}
      <div className={`flex-1 flex items-center justify-between gap-2 px-5 ${full ? "py-4" : "py-8"}`}>
        <TeamColumn side={TeamSide.home} engine={engine} T={T} teamName={home?.name} setPicker={setPicker} />

        {/* center stack */}
        <div className="flex-1 flex flex-col items-center justify-center gap-2 sm:gap-3 min-w-0">
          <div className="font-bold tracking-widest text-center line-clamp-1 text-[clamp(1rem,2vw,1.75rem)]"
            style={{ color: over ? T.accent : T.secondaryText }}>{engine.periodLabel}</div>

          {/* CLOCK — tap to start/pause (or skip a break) */}
          <div onClick={() => (inBreak ? engine.skipBreak() : engine.toggleClock())}
            className="font-mono font-black tabular-nums leading-none text-[clamp(4rem,14vw,11rem)]"
            style={{
              ...TOUCH, color: showTenths ? T.strike : T.clock,
              textShadow: T.glowRadius ? `0 0 ${T.glowRadius}px ${T.clockGlow}, 0 0 ${T.glowRadius * 1.7}px ${T.clockGlow}99` : "none",
            }}
            aria-label={`שעון ${clockString(engine.clock.remainingMS, showTenths)}`}>
            {clockString(engine.clock.remainingMS, showTenths)}
          </div>

          {/* below-clock: edit stepper / skip-break / start-hint */}
          {editing ? (
            <TimeStepper engine={engine} T={T} />
          ) : inBreak ? (
            <button onClick={() => engine.skipBreak()} className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: T.accent }}>
              <SkipForward className="w-4 h-4" /> {HE.skipBreak}
            </button>
          ) : (engine.phase === Phase.ready || engine.phase === Phase.readyOvertime) ? (
            <span className="text-[13px] font-semibold" style={{ color: T.secondaryText }}>{HE.tapToStart}</span>
          ) : engine.phase === Phase.paused ? (
            <span className="text-[13px] font-bold" style={{ color: T.strike }}>{HE.paused}</span>
          ) : <div className="h-4" />}

          {/* passive-play pill — tap to reset */}
          {engine.settings.passivePlayEnabled && (
            <button onClick={() => engine.resetPassive()}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full transition-transform"
              style={{ background: T.panel, color: engine.passiveIsWarning ? T.passiveWarning : T.passive, transform: engine.passiveIsWarning ? "scale(1.1)" : "none" }}>
              <StickBall mono className="w-3.5 h-3.5" />
              <span className="text-[15px] font-black tabular-nums">{engine.passiveSeconds}</span>
            </button>
          )}

          {/* control bar */}
          <div className="flex items-center gap-3 sm:gap-4 pt-1">
            <ControlBtn icon={RotateCcw} onClick={handleReset} tint={resetArmed ? "#fb923c" : T.controlTint} label="אפס" />
            <ControlBtn icon={editing ? CheckCircle2 : Pencil} onClick={() => (editing ? engine.endEditing() : engine.beginEditing())} tint={editing ? T.accent : T.controlTint} label="עריכה" fill={editing} />
            <ControlBtn icon={Megaphone} onClick={() => engine.buzz()} tint={T.controlTint} label="צפירה" fill />
            <ControlBtn icon={SettingsIcon} onClick={() => setShowSettings(true)} tint={T.controlTint} label={HE.settings} fill />
            <ControlBtn icon={Paintbrush} onClick={() => setThemeKind(k => (k === "led" ? "modern" : "led"))} tint={T.controlTint} label={HE.theme} fill />
          </div>

          {/* judge: save when over + return-to-not-started */}
          {game && over && (
            <div className="flex flex-col items-center gap-1 pt-1">
              {saving ? <Loader2 className="w-6 h-6 animate-spin" style={{ color: T.accent }} />
                : <button onClick={doSave} className="flex items-center gap-2 px-4 py-2 rounded-full text-white text-sm font-bold" style={{ background: T.accent }}>
                    <Save className="w-4 h-4" /> {HE.saveResult}
                  </button>}
              {saveErr && <span className="text-[12px]" style={{ color: T.cardRed }}>{saveErr}</span>}
            </div>
          )}
          {game && (
            confirmAbandon ? (
              <div className="flex items-center gap-2 pt-1 text-[12px]" style={{ color: T.secondaryText }}>
                <span>{HE.abandonConfirm}</span>
                <button onClick={doAbandon} disabled={abandoning} className="px-2.5 py-1 rounded-md font-bold text-white" style={{ background: "#f59e0b" }}>{abandoning ? "…" : HE.abandonYes}</button>
                <button onClick={() => setConfirmAbandon(false)} className="px-2.5 py-1 rounded-md font-bold" style={{ background: T.panel }}>{HE.cancel}</button>
              </div>
            ) : (
              <button onClick={() => { setSaveErr(null); setConfirmAbandon(true) }} className="flex items-center gap-1.5 text-[12px] font-semibold pt-1" style={{ color: T.secondaryText }}>
                <Undo2 className="w-3.5 h-3.5" /> {HE.abandon}
              </button>
            )
          )}
        </div>

        <TeamColumn side={TeamSide.guest} engine={engine} T={T} teamName={guest?.name} setPicker={setPicker} />
      </div>

      {/* player picker */}
      {picker && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" dir="rtl" onClick={() => setPicker(null)}>
          <div className="w-full max-w-sm max-h-[80vh] overflow-hidden flex flex-col rounded-2xl border" style={{ background: T.panel, borderColor: "rgba(255,255,255,0.12)" }} onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
              <h4 className="font-bold text-sm text-white">
                {picker.kind === "goal" ? HE.pickScorer : HE.pickCarded} · {(picker.side === TeamSide.home ? home : guest)?.name}
              </h4>
              <button onClick={() => setPicker(null)} className="p-1 text-white/60 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-2 overflow-y-auto">
              {rosterFor(picker.side).map(p => (
                <button key={p.id} onClick={() => resolvePick(p)} className={`w-full flex items-center gap-2 py-2 px-3 rounded-lg text-sm text-right hover:bg-white/10 transition-colors ${engine.isEjected(p.id) ? "opacity-40" : ""}`}>
                  <span className="w-6 text-center text-[11px] font-mono text-white/40">{p.jersey_number ?? "–"}</span>
                  <span className="flex-1 text-white truncate">{p.first_name} {p.last_name}</span>
                  {p.position === "Goalkeeper" && <span className="text-[9px] font-bold" style={{ color: T.cardBlue }}>GK</span>}
                  {engine.isEjected(p.id) && <span className="text-[9px] font-bold" style={{ color: T.cardRed }}>הורחק</span>}
                </button>
              ))}
              {picker.kind === "goal" && (
                <button onClick={() => resolvePick(null)} className="w-full py-2 px-3 rounded-lg text-sm text-white/60 hover:bg-white/10 transition-colors">{HE.noPlayer}</button>
              )}
              {attendingIds && attendingIds.size > 0 && (
                <button onClick={() => setShowAllRoster(v => !v)} className="w-full mt-1 py-2 px-3 rounded-lg text-xs text-white/50 hover:bg-white/10 transition-colors border-t border-white/10">
                  {showAllRoster ? "הצג רק מי שאישר הגעה" : "הצג את כל הסגל"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <SettingsSheet engine={engine} T={T} themeKind={themeKind} setThemeKind={setThemeKind}
          updateSettings={updateSettings} onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}

/* ---------- edit-mode time stepper (minutes / seconds) ---------- */
function TimeStepper({ engine, T }) {
  const total = engine.settings.periodMS
  const minutes = Math.floor(total / 60000)
  const seconds = Math.floor(total / 1000) % 60
  const set = (m, s) => engine.setPeriodLength(Math.max(0, Math.min(99, m)) * 60000 + ((s + 60) % 60) * 1000)
  const Field = ({ label, value, onDec, onInc }) => (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-semibold" style={{ color: T.secondaryText }}>{label}</span>
      <div className="flex items-center gap-2" style={{ color: T.accent }}>
        <button onClick={onDec}><Minus className="w-6 h-6" /></button>
        <span className="text-xl font-bold tabular-nums" style={{ color: T.primaryText }}>{String(value).padStart(2, "0")}</span>
        <button onClick={onInc}><Plus className="w-6 h-6" /></button>
      </div>
    </div>
  )
  return (
    <div className="flex items-center gap-5">
      <Field label={HE.minutes} value={minutes} onDec={() => set(minutes - 1, seconds)} onInc={() => set(minutes + 1, seconds)} />
      <Field label={HE.seconds} value={seconds} onDec={() => set(minutes, seconds - 1)} onInc={() => set(minutes, seconds + 1)} />
    </div>
  )
}

/* ---------- settings sheet (mirrors iOS SettingsSheet essentials) ---------- */
function SettingsSheet({ engine, T, themeKind, setThemeKind, updateSettings, onClose }) {
  const s = engine.settings
  const mins = Math.max(1, Math.round(s.periodMS / 60000))
  const Row = ({ label, children }) => (
    <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
      <span className="text-sm font-medium" style={{ color: T.primaryText }}>{label}</span>
      {children}
    </div>
  )
  const Step = ({ value, suffix, onDec, onInc }) => (
    <div className="flex items-center gap-3" style={{ color: T.accent }}>
      <button onClick={onDec}><Minus className="w-5 h-5" /></button>
      <span className="text-sm font-bold tabular-nums min-w-[3.5rem] text-center" style={{ color: T.primaryText }}>{value} {suffix}</span>
      <button onClick={onInc}><Plus className="w-5 h-5" /></button>
    </div>
  )
  const Toggle = ({ on, onToggle }) => (
    <button onClick={onToggle} className="w-11 h-6 rounded-full transition-colors relative" style={{ background: on ? T.accent : "rgba(255,255,255,0.2)" }}>
      <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: on ? "1.5rem" : "0.125rem" }} />
    </button>
  )
  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" dir="rtl" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden" style={{ background: T.panel }} onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 flex items-center justify-between border-b" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
          <h4 className="font-bold text-white">{HE.settings}</h4>
          <button onClick={onClose} className="px-3 py-1 rounded-lg text-sm font-bold text-white" style={{ background: T.accent }}>{HE.done}</button>
        </div>
        <div className="px-4 pb-3">
          <Row label={HE.format}>
            <select value={s.format} onChange={e => updateSettings({ format: e.target.value })} className="bg-black/30 text-white text-sm rounded-lg px-2 py-1 outline-none">
              <option value={GameFormat.twoHalves}>{HE.formatHalves}</option>
              <option value={GameFormat.threeThirds}>{HE.formatThirds}</option>
            </select>
          </Row>
          <Row label={HE.periodLength}><Step value={mins} suffix={HE.minutes} onDec={() => engine.setPeriodLength((mins - 1) * 60000)} onInc={() => engine.setPeriodLength((mins + 1) * 60000)} /></Row>
          <Row label={HE.overtime}><Toggle on={s.overtimeEnabled} onToggle={() => updateSettings({ overtimeEnabled: !s.overtimeEnabled })} /></Row>
          <Row label={HE.breakLength}><Step value={s.halfBreakMinutes} suffix={HE.minutes} onDec={() => updateSettings({ halfBreakMinutes: Math.max(1, s.halfBreakMinutes - 1) })} onInc={() => updateSettings({ halfBreakMinutes: Math.min(5, s.halfBreakMinutes + 1) })} /></Row>
          <Row label={HE.passivePlay}><Toggle on={s.passivePlayEnabled} onToggle={() => updateSettings({ passivePlayEnabled: !s.passivePlayEnabled })} /></Row>
          <Row label={HE.theme}>
            <select value={themeKind} onChange={e => setThemeKind(e.target.value)} className="bg-black/30 text-white text-sm rounded-lg px-2 py-1 outline-none">
              <option value="led">{HE.themeLed}</option>
              <option value="modern">{HE.themeModern}</option>
            </select>
          </Row>
          <button onClick={() => { engine.resetGame(); onClose() }} className="w-full mt-3 py-2.5 rounded-lg text-sm font-bold" style={{ background: "rgba(240,0,0,0.15)", color: "#ff6b6b" }}>
            <RotateCcw className="w-4 h-4 inline ml-1" /> {HE.resetGame}
          </button>
        </div>
      </div>
    </div>
  )
}
