import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { getMyAvailability, setMyAvailability, getGameAvailability } from "@/lib/availability"
import { getApprovedMedicalPlayerIds } from "@/lib/medical"
import { Check, X, Loader2, CalendarCheck, AlertTriangle } from "lucide-react"

const MED_MSG = "כדי לאשר הגעה יש להעלות בדיקה רפואית ולקבל אישור בתוקף"
const MIN_PLAYERS = 4 // a team wants at least this many outfield + a goalkeeper

/**
 * Availability panel for an upcoming game (#3 / attendance epic).
 *  - A rostered player toggles מגיע / לא מגיע (signing up requires a valid medical).
 *  - Officials (a coach of a team, or an admin) get the full per-team picture:
 *    מגיעים / לא מגיעים / לא הגיבו + indicators (count, <4 warning, no-GK warning).
 *  - A plain player sees only who's coming/not from their OWN team.
 * Team visibility is enforced by RLS; this renders only what the caller may read.
 */
export default function GameAvailability({ game, myPlayerId, officialTeamIds = [], playerTeamId = null, teamsMap = {}, playersMap = {} }) {
  const [myStatus, setMyStatus] = useState(null)
  const [rows, setRows] = useState([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [medOk, setMedOk] = useState(null)
  const [err, setErr] = useState(null)

  const canSeeAny = officialTeamIds.length > 0 || !!playerTeamId

  useEffect(() => {
    let alive = true
    Promise.all([
      myPlayerId ? getMyAvailability(game.id, myPlayerId) : Promise.resolve(null),
      canSeeAny ? getGameAvailability(game.id) : Promise.resolve([]),
      myPlayerId ? getApprovedMedicalPlayerIds([myPlayerId]) : Promise.resolve(new Set()),
    ]).then(([mine, all, med]) => {
      if (!alive) return
      setMyStatus(mine)
      setRows(all)
      setMedOk(myPlayerId ? med.has(myPlayerId) : null)
      setLoading(false)
    })
    return () => { alive = false }
  }, [game.id, myPlayerId, canSeeAny])

  const choose = async (status) => {
    setErr(null)
    if (status === "available" && medOk === false) { setErr(MED_MSG); return }
    setSaving(true)
    try {
      await setMyAvailability(game.id, status)
      setMyStatus(status)
      if (status === "available") setMedOk(true)
      if (canSeeAny) setRows(await getGameAvailability(game.id))
    } catch (e) {
      setErr(e?.message === "no-valid-medical" ? MED_MSG : "הפעולה נכשלה, נסו שוב")
    } finally { setSaving(false) }
  }

  if ((!myPlayerId && !canSeeAny) || loading) return null

  const statusByPlayer = Object.fromEntries(rows.map(r => [r.player_id, r.status]))
  const rosterOf = (teamId) => Object.values(playersMap).filter(p => p.team_id === teamId)
  const nameOf = (p) => `${p.first_name} ${p.last_name}`.trim()

  const teamsToShow = [
    ...officialTeamIds.map(tid => ({ tid, full: true })),
    ...(playerTeamId && !officialTeamIds.includes(playerTeamId) ? [{ tid: playerTeamId, full: false }] : []),
  ]

  const Col = ({ label, cls, list }) => (
    <div className="min-w-0">
      <p className={`text-[11px] font-semibold mb-1 ${cls}`}>{label} ({list.length})</p>
      {list.length === 0
        ? <p className="text-[11px] text-slate-400">—</p>
        : list.map(p => (
          <p key={p.id} className="text-xs text-slate-700 dark:text-slate-300 truncate">
            {nameOf(p)}{p.position === "Goalkeeper" ? " 🧤" : ""}
          </p>
        ))}
    </div>
  )

  return (
    <div className="card p-4 space-y-4">
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
        <CalendarCheck className="w-4 h-4 text-orange-500" /> זמינות למשחק
      </h3>

      {myPlayerId && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500 dark:text-slate-400">מגיע/ה למשחק?</span>
            <button onClick={() => choose("available")} disabled={saving || medOk === false}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${myStatus === "available" ? "bg-emerald-500 text-white" : "border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"}`}>
              <Check className="w-3.5 h-3.5" /> מגיע/ה
            </button>
            <button onClick={() => choose("unavailable")} disabled={saving}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${myStatus === "unavailable" ? "bg-red-500 text-white" : "border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"}`}>
              <X className="w-3.5 h-3.5" /> לא מגיע/ה
            </button>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
          </div>
          {medOk === false && (
            <p className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{MED_MSG} — <Link to="/me" className="font-semibold underline">להעלאה</Link></span>
            </p>
          )}
          {err && <p className="text-[11px] text-red-600 dark:text-red-400">{err}</p>}
        </div>
      )}

      {teamsToShow.map(({ tid, full }) => {
        const roster = rosterOf(tid)
        const coming = roster.filter(p => statusByPlayer[p.id] === "available")
        const notComing = roster.filter(p => statusByPlayer[p.id] === "unavailable")
        const noReply = roster.filter(p => !statusByPlayer[p.id])
        const gkComing = coming.some(p => p.position === "Goalkeeper")
        const tooFew = coming.length < MIN_PLAYERS
        return (
          <div key={tid} className="pt-3 border-t border-slate-100 dark:border-slate-700/50">
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <span className="text-xs font-bold text-slate-900 dark:text-white truncate">{teamsMap[tid]?.name || "קבוצה"}</span>
              {full && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${tooFew ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"}`}>{coming.length} מגיעים</span>
                  {tooFew && <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"><AlertTriangle className="w-3 h-3" /> פחות מ-4</span>}
                  {!gkComing && <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"><AlertTriangle className="w-3 h-3" /> אין שוער</span>}
                </div>
              )}
            </div>
            <div className={`grid gap-3 ${full ? "grid-cols-3" : "grid-cols-2"}`}>
              <Col label="מגיעים" cls="text-emerald-600 dark:text-emerald-400" list={coming} />
              <Col label="לא מגיעים" cls="text-red-600 dark:text-red-400" list={notComing} />
              {full && <Col label="לא הגיבו" cls="text-slate-500 dark:text-slate-400" list={noReply} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}
