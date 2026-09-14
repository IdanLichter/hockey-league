import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2, Loader2, Circle, AlertTriangle, XCircle, Eye, RefreshCw,
} from 'lucide-react'
import {
  fetchLiveEditRun, isTerminalStage, stageIndex, stageLabel,
  loadReasonText, elapsedText, safeRoute, STAGE_STEPS,
} from '@/lib/liveEdit'
import { ChangedFiles, AgentSummary, RunLinks } from './LiveEditParts'

const POLL_MS = 5000
const GIVE_UP_MS = 10 * 60 * 1000 // three times the usual round trip

/**
 * Polls one run until it settles. Stops on a terminal stage, on a reason that
 * re-asking cannot change, after ten minutes, and on unmount — a panel the admin
 * closed must not keep a timer alive behind the app.
 */
function useRun(number) {
  const [item, setItem] = useState(null)
  const [reason, setReason] = useState(null)
  const [stalled, setStalled] = useState(false)
  const [attempt, setAttempt] = useState(0) // manual refresh re-runs the effect
  const deadline = useRef(0)

  useEffect(() => {
    if (!Number.isFinite(Number(number))) return

    let stopped = false
    let busy = false
    let timer = null
    if (!deadline.current) deadline.current = Date.now() + GIVE_UP_MS

    const stop = () => { stopped = true; clearTimeout(timer) }

    const poll = async () => {
      if (stopped || busy) return
      busy = true
      const res = await fetchLiveEditRun(number)
      busy = false
      if (stopped) return

      if (res.ok) {
        setItem(res.item)
        setReason(null)
        if (isTerminalStage(res.item?.stage)) { stop(); return }
      } else {
        setReason(res.reason)
        // Not wired up, or not allowed: asking again in five seconds answers the
        // same thing, so stop rather than hammer a dead route for ten minutes.
        if (['not-configured', 'forbidden', 'unauthorized'].includes(res.reason)) { stop(); return }
      }

      if (Date.now() >= deadline.current) { setStalled(true); stop(); return }
      timer = setTimeout(poll, POLL_MS)
    }

    poll()

    // A backgrounded tab throttles timers to about once a minute, so coming back
    // would otherwise stare at a stale ladder. Ask again the moment it returns.
    const onVisible = () => { if (document.visibilityState === 'visible') poll() }
    document.addEventListener('visibilitychange', onVisible)

    return () => { stop(); document.removeEventListener('visibilitychange', onVisible) }
  }, [number, attempt])

  const refresh = useCallback(() => {
    deadline.current = Date.now() + GIVE_UP_MS
    setStalled(false)
    setAttempt((a) => a + 1)
  }, [])

  return { item, reason, stalled, refresh }
}

// ─── Ladder ─────────────────────────────────────────────────────────────────

function Step({ label, state }) {
  const icon = {
    done: <CheckCircle2 className="size-4 text-pos" />,
    active: <Loader2 className="size-4 text-brand animate-spin" />,
    pending: <Circle className="size-4 text-fg-faint" />,
    unknown: <Circle className="size-4 text-fg-faint" />,
  }[state]

  const tone = {
    done: 'text-fg-soft',
    active: 'text-fg-strong font-bold',
    pending: 'text-fg-subtle',
    unknown: 'text-fg-subtle',
  }[state]

  return (
    <li className="flex items-center gap-2">
      <span className="shrink-0">{icon}</span>
      <span className={`text-sm ${tone}`}>{label}</span>
      {state === 'unknown' && <span className="text-2xs text-fg-faint">לא ידוע</span>}
    </li>
  )
}

/**
 * `current` is -1 when the server hasn't answered yet, or answers with a stage
 * this build doesn't know. Only נשלח survives that — the POST came back with an
 * issue number, so it is a fact — and everything past what we can prove is drawn
 * as unknown. An invented "probably deploying by now" is what this view replaced.
 */
function Ladder({ current }) {
  return (
    <ul className="space-y-2">
      {STAGE_STEPS.map((step, i) => {
        let state
        if (current < 0) state = i === 0 ? 'done' : 'unknown'
        else if (i < current) state = 'done'
        else if (i === current) state = 'active'
        else state = 'pending'
        return <Step key={step.stage} label={step.label} state={state} />
      })}
    </ul>
  )
}

// ─── Outcomes ───────────────────────────────────────────────────────────────

function Done({ item, issueHref, fallbackRoute, onClose }) {
  const navigate = useNavigate()
  const route = safeRoute(item?.route) || safeRoute(fallbackRoute)

  const go = () => {
    if (route) navigate(route)
    onClose?.()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="size-5 text-pos shrink-0" />
        <p className="font-bold text-fg-strong flex-1">התיקון באוויר</p>
      </div>

      <AgentSummary summary={item?.summary} />
      <ChangedFiles commit={item?.commit} />

      {route && (
        <>
          <button onClick={go} className="btn-primary w-full">
            <Eye className="size-4" />
            לצפייה בעמוד
          </button>
          {/* A subtle change is hard to spot — say where to look. */}
          <p className="text-2xs text-fg-subtle text-center" dir="ltr">{route}</p>
        </>
      )}

      <RunLinks item={item} issueHref={issueHref} />
    </div>
  )
}

function Refused({ item, issueHref }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-5 text-fg-muted shrink-0" />
        <p className="font-bold text-fg-strong flex-1">הסוכן לא ביצע את השינוי</p>
      </div>
      {item?.summary
        ? <AgentSummary summary={item.summary} />
        : <p className="text-sm text-fg-muted">הסוכן לא צירף הסבר.</p>}
      {/* Refusal is a normal answer here, not a malfunction: the agent is fenced
          out of the database, ההרשאות and CI, so plenty of requests are simply
          not its to make. */}
      <p className="text-xs text-fg-subtle">
        זה קורה: לסוכן אין גישה לנתונים, להרשאות ולפריסה — בקשה כזו צריכה טיפול ידני.
      </p>
      <RunLinks item={item} issueHref={issueHref} />
    </div>
  )
}

function Failed({ item, issueHref }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <XCircle className="size-5 text-neg shrink-0" />
        <p className="font-bold text-fg-strong flex-1">הפריסה לא עברה</p>
      </div>
      <p className="text-sm text-fg-soft">
        השינוי לא עלה לאתר וצריך מישהו שיסתכל על זה. הקישור לבקשה מכיל את הפרטים.
      </p>
      <AgentSummary summary={item?.summary} />
      <RunLinks item={item} issueHref={issueHref} />
    </div>
  )
}

// ─── View ───────────────────────────────────────────────────────────────────

/**
 * Replaces the old "נשלח בהצלחה" card. The round trip is roughly four to five
 * minutes — agent, push, CI deploy — and an admin at a rink needs to see it
 * moving, then see what actually changed.
 */
export default function LiveEditProgress({ number, issueHref, route, onClose, onReset }) {
  const { item, reason, stalled, refresh } = useRun(number)

  const stage = item?.stage
  const terminal = isTerminalStage(stage)
  const current = item ? stageIndex(stage) : -1

  // The clock runs off the issue's own creation time once we have it, so a
  // panel reopened later still shows a true elapsed rather than starting at 0.
  const created = Date.parse(item?.createdAt ?? '')
  const closed = Date.parse(item?.closedAt ?? '')
  const startRef = useRef(Date.now())
  const start = Number.isFinite(created) ? created : startRef.current

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (terminal) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [terminal])

  const elapsed = elapsedText((terminal && Number.isFinite(closed) ? closed : now) - start)

  if (terminal) {
    return (
      <div className="space-y-3">
        {stage === 'done' && <Done item={item} issueHref={issueHref} fallbackRoute={route} onClose={onClose} />}
        {stage === 'refused' && <Refused item={item} issueHref={issueHref} />}
        {stage === 'failed' && <Failed item={item} issueHref={issueHref} />}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-line-subtle">
          <span className="text-2xs text-fg-subtle">
            הסתיים אחרי <span dir="ltr" className="tabular-nums">{elapsed}</span>
          </span>
          <button onClick={onReset} className="btn-ghost btn-sm">בקשה נוספת</button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <p className="font-bold text-fg-strong flex-1">{item ? stageLabel(stage) : 'הבקשה נשלחה'}</p>
        <span className="text-2xs text-fg-subtle tabular-nums" dir="ltr">{elapsed}</span>
      </div>

      <Ladder current={current} />

      <p className="text-xs text-fg-muted">
        בדרך כלל <span dir="ltr">4-5</span> דקות: הסוכן מתקן, דוחף את הקוד, והאתר נבנה מחדש.
        אפשר לסגור — הבקשה ממשיכה לרוץ.
      </p>

      {item && current < 0 && (
        <p className="text-xs text-fg-subtle">
          השרת מדווח שלב לא מוכר (<span dir="ltr">{String(stage ?? '—')}</span>).
        </p>
      )}

      {/* A failed poll is not a failed run: the issue was filed, we just can't
          see it right now. Say exactly that instead of turning the view red. */}
      {reason && (
        <p className="text-xs text-fg-subtle">
          {loadReasonText(reason)} — הבקשה עצמה נשלחה בכל מקרה.
        </p>
      )}

      {stalled && (
        <p className="text-xs text-fg-subtle">לוקח יותר מהרגיל. הפסקנו לבדוק אוטומטית.</p>
      )}

      <div className="flex items-center gap-2">
        <button onClick={refresh} className="btn-ghost btn-sm">
          <RefreshCw className="size-3.5" />
          בדיקה עכשיו
        </button>
        <button onClick={onReset} className="btn-ghost btn-sm ms-auto">בקשה נוספת</button>
      </div>

      <RunLinks item={item} issueHref={issueHref} />
    </div>
  )
}
