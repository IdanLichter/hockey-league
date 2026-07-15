import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { getPendingGameChangeRequests, approveGameChange, rejectGameChange } from "@/lib/gameRequests"
import { Check, X, CalendarClock, RefreshCw, ArrowLeft, MapPin, ExternalLink } from "lucide-react"
import { format } from "date-fns"

/**
 * League-manager / admin review queue for coach-submitted game reschedules.
 * Approve → approve_game_change RPC, which ATOMICALLY writes the proposed
 * date/venue onto the game. Reject → reject_game_change (game untouched). Both
 * are self-gated to admins + league-managers; an optional note reaches the coach
 * on the decision notification. teamsMap resolves team names.
 */
export default function GameChangeRequestsReview({ teamsMap = {} }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)
  const [notes, setNotes] = useState({}) // request id -> optional decision note

  const load = async () => {
    try { setLoading(true); setError(null); setItems(await getPendingGameChangeRequests()) }
    catch { setError("שגיאה בטעינת הבקשות") } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const act = async (r, fn, failMsg) => {
    setBusyId(r.id); setError(null)
    try { await fn(r.id, notes[r.id]?.trim() || null); await load() }
    catch (e) { setError(e.message || failMsg) } finally { setBusyId(null) }
  }

  const fmt = (d) => (d ? format(new Date(d), "d/M/yyyy HH:mm") : null)
  const teamName = (id) => teamsMap[id]?.name || "קבוצה"

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-orange-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
            <CalendarClock className="w-5 h-5 text-orange-500" /> בקשות לשינוי משחק
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">אישור מעדכן אוטומטית את מועד/מגרש המשחק</p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> רענון
        </button>
      </div>

      {error && (
        <div className="card p-3 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-400">{error}</div>
      )}

      {items.length === 0 ? (
        <div className="card p-10 text-center">
          <CalendarClock className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">אין בקשות שינוי ממתינות</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((r) => {
            const g = r.games || {}
            const who = r.requester?.display_name || "מאמן"
            const busy = busyId === r.id
            const fromDate = fmt(g.game_date || r.original_date)
            const toDate = fmt(r.proposed_date)
            const fromVenue = g.venue || r.original_venue || "—"
            const toVenue = r.proposed_venue
            return (
              <div key={r.id} className="card p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-900 dark:text-white">
                      <span className="font-bold">{who}</span>
                      <span className="text-slate-400 dark:text-slate-500"> ({teamName(r.team_id)})</span>
                      <span className="text-slate-400 dark:text-slate-500"> מבקש/ת לשנות</span>
                    </p>
                    <Link to={`/games/${r.game_id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:text-orange-500 transition-colors mt-0.5">
                      {teamName(g.home_team_id)} <span className="text-slate-400">נגד</span> {teamName(g.away_team_id)}
                      <ExternalLink className="w-3 h-3 opacity-60" />
                    </Link>
                  </div>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0">{fmt(r.created_at)}</span>
                </div>

                {/* was → wants */}
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800/40 p-3 space-y-1.5 text-sm">
                  {toDate && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <CalendarClock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="text-slate-400 line-through">{fromDate || "—"}</span>
                      <ArrowLeft className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-bold text-slate-900 dark:text-white">{toDate}</span>
                    </div>
                  )}
                  {toVenue && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="text-slate-400 line-through">{fromVenue}</span>
                      <ArrowLeft className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-bold text-slate-900 dark:text-white">{toVenue}</span>
                    </div>
                  )}
                </div>

                {r.reason && <p className="text-sm text-slate-600 dark:text-slate-300 italic">"{r.reason}"</p>}

                <input
                  type="text" value={notes[r.id] || ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                  placeholder="הערה למאמן (רשות)"
                  className="filter-input w-full text-sm"
                />

                <div className="flex items-center gap-2">
                  <button onClick={() => act(r, approveGameChange, "שגיאה באישור הבקשה")} disabled={busy}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors disabled:opacity-50">
                    <Check className="w-3.5 h-3.5" /> אישור והחלה
                  </button>
                  <button onClick={() => act(r, rejectGameChange, "שגיאה בדחיית הבקשה")} disabled={busy}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50">
                    <X className="w-3.5 h-3.5" /> דחייה
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
