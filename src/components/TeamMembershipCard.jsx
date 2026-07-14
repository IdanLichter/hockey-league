import { useState, useEffect } from "react"
import { Users, Loader2, Clock, LogOut, ArrowLeftRight, Check } from "lucide-react"
import { getTeams } from "@/lib/api"
import { getMyJoinRequest, requestTeamJoin, cancelTeamJoin, leaveTeam } from "@/lib/teamMembership"

/**
 * Self-service team membership (Package 1b), shown on the owner's account/player
 * page. A linked player can request to join a team (coach approves), switch teams,
 * or leave (become a free agent). onChange() lets the parent refetch the player
 * after a leave (which changes players.team_id immediately).
 */
export default function TeamMembershipCard({ player, onChange }) {
  const [teams, setTeams] = useState([])
  const [pending, setPending] = useState(null)
  const [picking, setPicking] = useState(false)
  const [teamId, setTeamId] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const load = async () => {
    try {
      const [ts, p] = await Promise.all([getTeams("name", true), getMyJoinRequest()])
      setTeams(ts); setPending(p)
    } catch { /* ignore */ }
  }
  useEffect(() => { load() }, [player?.id, player?.team_id])

  const currentTeam = teams.find(t => t.id === player?.team_id)
  const choices = teams.filter(t => t.id !== player?.team_id)

  const doRequest = async () => {
    if (!teamId) return
    setBusy(true); setError(null)
    try { await requestTeamJoin(teamId); setPicking(false); setTeamId(""); await load() }
    catch (e) { setError(e?.message === "join-already-pending" ? "כבר יש לך בקשת הצטרפות ממתינה" : "שגיאה בשליחת הבקשה") }
    finally { setBusy(false) }
  }
  const doCancel = async () => {
    if (!pending) return
    setBusy(true)
    try { await cancelTeamJoin(pending.id); await load() } catch { /* ignore */ } finally { setBusy(false) }
  }
  const doLeave = async () => {
    setBusy(true)
    try { await leaveTeam(); onChange?.() } catch { /* ignore */ } finally { setBusy(false) }
  }

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50">
      {pending ? (
        <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1 min-w-0">בקשת הצטרפות ל־<b>{pending.teams?.name || "קבוצה"}</b> ממתינה לאישור המאמן</span>
          <button onClick={doCancel} disabled={busy} className="font-semibold text-slate-400 hover:text-red-500 transition-colors shrink-0">ביטול</button>
        </div>
      ) : picking ? (
        <div className="flex items-center gap-2">
          <select value={teamId} onChange={e => setTeamId(e.target.value)}
            className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30">
            <option value="">בחר/י קבוצה…</option>
            {choices.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button onClick={doRequest} disabled={!teamId || busy}
            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} שלח בקשה
          </button>
          <button onClick={() => { setPicking(false); setTeamId("") }} className="text-xs font-semibold text-slate-400 hover:text-slate-600 px-1 shrink-0">ביטול</button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 min-w-0">
            <Users className="w-3.5 h-3.5 shrink-0 text-orange-500" />
            {currentTeam
              ? <span className="truncate">הקבוצה שלך: <b className="text-slate-700 dark:text-slate-200">{currentTeam.name}</b></span>
              : <span>שחקן/ית חופשי/ה — לא משויכ/ת לקבוצה</span>}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={() => setPicking(true)}
              className="flex items-center gap-1 text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline">
              <ArrowLeftRight className="w-3.5 h-3.5" /> {currentTeam ? "החלף קבוצה" : "הצטרף לקבוצה"}
            </button>
            {currentTeam && (
              <button onClick={doLeave} disabled={busy}
                className="flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50">
                <LogOut className="w-3.5 h-3.5" /> עזוב
              </button>
            )}
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
