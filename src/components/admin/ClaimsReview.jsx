import { useState, useEffect } from "react"
import { getPendingClaims, approveClaim, rejectClaim } from "@/lib/claims"
import { Check, X, UserPlus, RefreshCw } from "lucide-react"
import { format } from "date-fns"
import TeamLogo from "@/components/TeamLogo"

/**
 * Admin review queue for "claim your player" requests (Stage B1).
 * Approve → links the profile to the player + grants the 'player' role.
 * Self-contained: loads its own pending claims. `teamsMap` is only for logos.
 */
export default function ClaimsReview({ teamsMap = {} }) {
  const [claims, setClaims] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)

  const load = async () => {
    try { setLoading(true); setError(null); setClaims(await getPendingClaims()) }
    catch { setError("שגיאה בטעינת הבקשות") }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const doApprove = async (claim) => {
    setBusyId(claim.id); setError(null)
    try { await approveClaim(claim); await load() }
    catch (e) { setError(e.message === "player-already-linked" ? "השחקן כבר משויך לחשבון אחר" : "שגיאה באישור הבקשה") }
    finally { setBusyId(null) }
  }
  const doReject = async (claim) => {
    setBusyId(claim.id); setError(null)
    try { await rejectClaim(claim.id); await load() }
    catch { setError("שגיאה בדחיית הבקשה") }
    finally { setBusyId(null) }
  }

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
            <UserPlus className="w-5 h-5 text-orange-500" /> בקשות בעלות על פרופיל
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            אישור מקשר את החשבון לשחקן ומעניק תפקיד שחקן
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> רענון
        </button>
      </div>

      {error && (
        <div className="card p-3 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-400">{error}</div>
      )}

      {claims.length === 0 ? (
        <div className="card p-10 text-center">
          <UserPlus className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">אין בקשות בעלות ממתינות</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {claims.map(claim => {
            const player = claim.players
            const team = teamsMap[player?.team_id]
            const claimant = claim.profiles?.display_name || "משתמש"
            const busy = busyId === claim.id
            return (
              <div key={claim.id} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <TeamLogo team={team} size={10} />
                  <div className="min-w-0">
                    <p className="text-sm text-slate-900 dark:text-white">
                      <span className="font-bold">{claimant}</span>
                      <span className="text-slate-400 dark:text-slate-500"> מבקש/ת להיות </span>
                      <span className="font-bold">{player ? `${player.first_name} ${player.last_name}` : "שחקן לא ידוע"}</span>
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                      {team?.name || "—"} · {format(new Date(claim.created_at), "d/M/yyyy HH:mm")}
                    </p>
                    {claim.note && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 italic">"{claim.note}"</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => doApprove(claim)} disabled={busy}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors disabled:opacity-50">
                    <Check className="w-3.5 h-3.5" /> אישור
                  </button>
                  <button onClick={() => doReject(claim)} disabled={busy}
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
