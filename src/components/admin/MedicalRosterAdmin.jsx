import { useState, useEffect, useMemo } from "react"
import { getMedicalRoster } from "@/lib/medical"
import { HeartPulse, RefreshCw, Search } from "lucide-react"
import { format } from "date-fns"

/**
 * B4 — league-manager / admin medical roster. One row per player: who holds a valid
 * medical, who's missing/expired, who's about to expire (≤30 days). Backed by the
 * medical_roster RPC (summary only — no files). Ordered problems-first by the RPC.
 */
const DAY = 86400000
const EXPIRY_WARN_DAYS = 30

function statusOf(row) {
  if (row.has_valid) {
    if (row.valid_until) {
      const d = new Date(row.valid_until)
      const days = Math.ceil((d - new Date()) / DAY)
      if (days <= EXPIRY_WARN_DAYS) return { key: "expiring", label: `פג ${format(d, "d/M/yy")}`, cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" }
      return { key: "valid", label: `בתוקף עד ${format(d, "d/M/yy")}`, cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" }
    }
    return { key: "valid", label: "בתוקף", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" }
  }
  if (row.latest_status === "pending") return { key: "pending", label: "ממתין לאישור", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" }
  if (row.latest_status === "approved") return { key: "expired", label: "פג תוקף", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" }
  if (row.latest_status === "rejected") return { key: "rejected", label: "נדחה", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" }
  return { key: "missing", label: "חסר", cls: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300" }
}

export default function MedicalRosterAdmin() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState("issues") // all | issues | expiring
  const [q, setQ] = useState("")

  const load = async () => {
    try { setError(null); setRows(await getMedicalRoster()) }
    catch { setError("שגיאה בטעינת המעקב הרפואי"); setRows([]) }
  }
  useEffect(() => { load() }, [])

  const decorated = useMemo(() => (rows || []).map(r => ({ ...r, st: statusOf(r) })), [rows])
  const counts = useMemo(() => ({
    valid: decorated.filter(r => r.st.key === "valid").length,
    expiring: decorated.filter(r => r.st.key === "expiring").length,
    issues: decorated.filter(r => !["valid", "expiring"].includes(r.st.key)).length,
    total: decorated.length,
  }), [decorated])

  const shown = decorated.filter(r => {
    if (filter === "issues" && ["valid", "expiring"].includes(r.st.key)) return false
    if (filter === "expiring" && r.st.key !== "expiring") return false
    if (q.trim()) {
      const hay = `${r.first_name} ${r.last_name} ${r.team_name || ""}`.toLowerCase()
      if (!hay.includes(q.trim().toLowerCase())) return false
    }
    return true
  })

  const FilterBtn = ({ id, label, n }) => (
    <button onClick={() => setFilter(id)}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filter === id ? "bg-orange-500 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"}`}>
      {label}{n != null ? ` (${n})` : ""}
    </button>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
          <HeartPulse className="w-5 h-5 text-orange-500" /> מעקב רפואי
        </h2>
        <button onClick={load} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> רענון
        </button>
      </div>

      {error && <div className="card p-3 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-400">{error}</div>}

      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="card p-3 text-center"><p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">{counts.valid}</p><p className="text-[11px] text-slate-400 mt-0.5">בתוקף</p></div>
        <div className="card p-3 text-center"><p className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 tabular-nums">{counts.expiring}</p><p className="text-[11px] text-slate-400 mt-0.5">פג בקרוב</p></div>
        <div className="card p-3 text-center"><p className="text-2xl font-extrabold text-red-600 dark:text-red-400 tabular-nums">{counts.issues}</p><p className="text-[11px] text-slate-400 mt-0.5">חסר / פג</p></div>
      </div>

      {/* Filters + search */}
      <div className="flex items-center gap-2 flex-wrap">
        <FilterBtn id="issues" label="בעיות" n={counts.issues} />
        <FilterBtn id="expiring" label="פג בקרוב" n={counts.expiring} />
        <FilterBtn id="all" label="הכל" n={counts.total} />
        <div className="relative flex-1 min-w-[160px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש שחקן או קבוצה"
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pr-8 pl-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30" />
        </div>
      </div>

      {rows === null ? (
        <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-7 w-7 border-2 border-orange-500 border-t-transparent" /></div>
      ) : shown.length === 0 ? (
        <p className="text-center text-sm text-slate-400 dark:text-slate-500 py-10">אין שחקנים תואמים</p>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  <th className="text-right font-bold px-4 py-2.5">שחקן</th>
                  <th className="text-right font-bold px-3 py-2.5">קבוצה</th>
                  <th className="text-right font-bold px-3 py-2.5">סטטוס רפואי</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {shown.map(r => (
                  <tr key={r.player_id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-white whitespace-nowrap">{r.first_name} {r.last_name}</td>
                    <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{r.team_name || "—"}</td>
                    <td className="px-3 py-2.5"><span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded ${r.st.cls}`}>{r.st.label}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
