import { useState, useEffect } from "react"
import { Gavel, HeartPulse, Loader2 } from "lucide-react"
import { useAuth } from "@/lib/AuthContext"
import { applyAsOfficial, getMyOfficialRoles, OFFICIAL_ROLE_LABEL } from "@/lib/officials"

const roleIcon = { judge: Gavel, medic: HeartPulse }

/**
 * D4 — a judge/medic self-submits to work an upcoming game; the league manager approves
 * it (in the Officials admin tab). Renders only for a scheduled game to a judge/medic.
 */
export default function OfficialSelfSubmit({ game }) {
  const { isJudgeRole, isMedic } = useAuth()
  const roles = [...(isJudgeRole ? ["judge"] : []), ...(isMedic ? ["medic"] : [])]
  const [mine, setMine] = useState([])
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    if (!roles.length || game.status !== "scheduled") return
    let alive = true
    getMyOfficialRoles(game.id).then(r => { if (alive) setMine(r) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id, roles.length, game.status])

  if (!roles.length || game.status !== "scheduled") return null

  const apply = async (role) => {
    setBusy(role)
    try { await applyAsOfficial(game.id, role); setMine(await getMyOfficialRoles(game.id)) }
    catch { /* ignore */ } finally { setBusy(null) }
  }

  const statusOf = (s) => s === "approved" ? { t: "שובצת ✓", c: "text-emerald-600 dark:text-emerald-400" }
    : s === "rejected" ? { t: "המועמדות נדחתה", c: "text-red-500" }
    : { t: "ממתין לאישור מנהל הליגה", c: "text-amber-600 dark:text-amber-400" }

  return (
    <div className="card p-4">
      <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2"><Gavel className="w-4 h-4 text-brand" /> הגשת מועמדות לשיבוץ</p>
      <div className="flex flex-wrap items-center gap-2 mt-2.5">
        {roles.map(role => {
          const RIcon = roleIcon[role]
          const m = mine.find(x => x.role === role)
          if (m) {
            const st = statusOf(m.status)
            return <span key={role} className={`inline-flex items-center gap-1.5 text-xs font-semibold ${st.c}`}><RIcon className="w-3.5 h-3.5" /> {OFFICIAL_ROLE_LABEL[role]}: {st.t}</span>
          }
          return (
            <button key={role} onClick={() => apply(role)} disabled={busy === role}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-brand text-brand-fg hover:bg-brand-hover transition-colors disabled:opacity-50">
              {busy === role ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RIcon className="w-3.5 h-3.5" />} הגש מועמדות כ{OFFICIAL_ROLE_LABEL[role]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
