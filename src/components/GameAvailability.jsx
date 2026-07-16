import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { getMyAvailability, setMyAvailability, getGameAvailability } from "@/lib/availability"
import { getApprovedMedicalPlayerIds } from "@/lib/medical"
import { Check, X, Loader2, CalendarCheck, AlertTriangle } from "lucide-react"

const MED_MSG = "כדי לאשר הגעה יש להעלות בדיקה רפואית ולקבל אישור בתוקף"

/**
 * Availability panel for an upcoming game (#3). A rostered player toggles מגיע/לא מגיע;
 * a coach/admin sees the in/out roster. Renders nothing when the viewer is neither a
 * player on one of the two teams nor able to see the roster.
 */
export default function GameAvailability({ gameId, myPlayerId, canSeeRoster, playersMap = {} }) {
  const [myStatus, setMyStatus] = useState(null)
  const [roster, setRoster] = useState([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [medOk, setMedOk] = useState(null) // does the viewer's own player hold a valid medical cert
  const [err, setErr] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.all([
      myPlayerId ? getMyAvailability(gameId, myPlayerId) : Promise.resolve(null),
      canSeeRoster ? getGameAvailability(gameId) : Promise.resolve([]),
      myPlayerId ? getApprovedMedicalPlayerIds([myPlayerId]) : Promise.resolve(new Set()),
    ]).then(([mine, all, med]) => {
      if (!alive) return
      setMyStatus(mine)
      setRoster(all)
      setMedOk(myPlayerId ? med.has(myPlayerId) : null)
      setLoading(false)
    })
    return () => { alive = false }
  }, [gameId, myPlayerId, canSeeRoster])

  const choose = async (status) => {
    setErr(null)
    if (status === "available" && medOk === false) { setErr(MED_MSG); return }
    setSaving(true)
    try {
      await setMyAvailability(gameId, status)
      setMyStatus(status)
      if (status === "available") setMedOk(true)
      if (canSeeRoster) setRoster(await getGameAvailability(gameId))
    } catch (e) {
      setErr(e?.message === "no-valid-medical" ? MED_MSG : "הפעולה נכשלה, נסו שוב")
    } finally { setSaving(false) }
  }

  if ((!myPlayerId && !canSeeRoster) || loading) return null

  const available = roster.filter(r => r.status === "available")
  const unavailable = roster.filter(r => r.status === "unavailable")
  const nameOf = (pid) => {
    const p = playersMap[pid]
    return p ? `${p.first_name} ${p.last_name}` : "שחקן"
  }

  return (
    <div className="card p-4 space-y-3">
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

      {canSeeRoster && (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-700/50 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mb-1">מגיעים ({available.length})</p>
            {available.length === 0
              ? <p className="text-[11px] text-slate-400">—</p>
              : available.map(r => <p key={r.player_id} className="text-xs text-slate-700 dark:text-slate-300 truncate">{nameOf(r.player_id)}</p>)}
          </div>
          <div>
            <p className="text-[11px] font-semibold text-red-600 dark:text-red-400 mb-1">לא מגיעים ({unavailable.length})</p>
            {unavailable.length === 0
              ? <p className="text-[11px] text-slate-400">—</p>
              : unavailable.map(r => <p key={r.player_id} className="text-xs text-slate-700 dark:text-slate-300 truncate">{nameOf(r.player_id)}</p>)}
          </div>
        </div>
      )}
    </div>
  )
}
