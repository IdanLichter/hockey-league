import { useState, useEffect } from "react"
import { getTeams } from "@/lib/api"
import { standingsComparator } from "@/lib/utils"
import { ageOf, DEFAULT_AGE } from "@/lib/ageGroups"
import { Trophy, Users, Crown, Swords, RefreshCw } from "lucide-react"
import { Standings } from "@/components/icons/HockeyIcons"
import { motion } from "framer-motion"
import TeamLogo from "@/components/TeamLogo"
import { TeamLink } from "@/components/EntityLinks"

export default function Home() {
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState("league")

  useEffect(() => { loadTeams() }, [])

  const loadTeams = async () => {
    try {
      setLoading(true); setError(null)
      const data = await getTeams('points', false)
      setTeams(data)
    } catch { setError("שגיאה בטעינת נתוני קבוצות") }
    finally { setLoading(false) }
  }

  const diff = (t) => (t.goals_for || 0) - (t.goals_against || 0)
  const played = (t) => (t.wins || 0) + (t.losses || 0) + (t.ties || 0)
  // The league table is senior only; youth-tournament teams have their own
  // standings on the tournament pages (they'd otherwise sit at 0 pts here).
  const seniorTeams = teams.filter(t => ageOf(t) === DEFAULT_AGE)
  const sorted = [...seniorTeams].sort(standingsComparator)
  const first = sorted[0] || null

  const matchups = sorted.length >= 7 ? [
    { p1: 2, t1: sorted[1], p2: 7, t2: sorted[6], series: "A" },
    { p1: 3, t1: sorted[2], p2: 6, t2: sorted[5], series: "B" },
    { p1: 4, t1: sorted[3], p2: 5, t2: sorted[4], series: "C" },
  ] : []

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-orange-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <span className="accent-bar mb-3" />
        <h1 className="page-title flex items-center gap-2.5">
          <Standings className="size-8 text-brand shrink-0" />
          טבלת הליגה
        </h1>
        <p className="page-subtitle mt-1">דירוג קבוצות עונת 2025-26</p>
      </motion.div>

      {error && (
        <div className="card p-4 border-danger-200 dark:border-danger-800 bg-danger-50 dark:bg-danger-950/30 flex items-center justify-between">
          <span className="text-danger-700 dark:text-danger-400 text-sm font-medium">{error}</span>
          <button onClick={loadTeams} className="flex items-center gap-1.5 px-3 py-1.5 bg-danger-600 text-white rounded-lg text-xs font-semibold hover:bg-danger-700 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> נסה שוב
          </button>
        </div>
      )}

      {/* Leader spotlight — the page's focal point */}
      {first && activeTab === "league" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}
          className="card overflow-hidden">
          <div className="flex items-center gap-4 p-5">
            <div className="relative shrink-0">
              <TeamLogo team={first} size={16} />
              <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-brand text-white shadow">
                <Crown className="size-3" />
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-brand-strong dark:text-brand-light">מובילת הליגה</p>
              <h2 className="text-2xl font-black text-fg-strong tracking-tight truncate mt-0.5">
                <TeamLink team={first} className="hover:text-brand transition-colors">{first.name}</TeamLink>
              </h2>
              <p className="muted text-sm mt-0.5">
                {played(first)} משחקים · הפרש {diff(first) > 0 ? '+' : ''}{diff(first)}
              </p>
            </div>
            <div className="text-center shrink-0 ps-2">
              <div className="stat-num text-4xl leading-none text-brand">{first.points || 0}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide muted mt-1">נקודות</div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Tabs */}
      <div className="tab-bar">
        <button onClick={() => setActiveTab("league")} className={activeTab === "league" ? "tab-active" : "tab-inactive"}>
          <Trophy className="w-4 h-4" /> טבלת הליגה
        </button>
        <button onClick={() => setActiveTab("playoff")} className={activeTab === "playoff" ? "tab-active" : "tab-inactive"}>
          <Swords className="w-4 h-4" /> מצב הפלייאוף
        </button>
      </div>

      {/* League Table */}
      {activeTab === "league" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-brand-deep text-white text-[11px] uppercase tracking-wider">
                  <th scope="col" className="ps-4 pe-2 py-3 text-right font-bold w-12 whitespace-nowrap">#</th>
                  <th scope="col" className="px-3 py-3 text-right font-bold whitespace-nowrap">קבוצה</th>
                  <th scope="col" className="px-2 py-3 text-center font-bold whitespace-nowrap">מש׳</th>
                  <th scope="col" className="px-2 py-3 text-center font-bold whitespace-nowrap">נ</th>
                  <th scope="col" className="px-2 py-3 text-center font-bold whitespace-nowrap">ת</th>
                  <th scope="col" className="px-2 py-3 text-center font-bold whitespace-nowrap">ה</th>
                  <th scope="col" className="px-2 py-3 text-center font-bold whitespace-nowrap">זכות</th>
                  <th scope="col" className="px-2 py-3 text-center font-bold whitespace-nowrap">חובה</th>
                  <th scope="col" className="px-2 py-3 text-center font-bold whitespace-nowrap">הפרש</th>
                  <th scope="col" className="ps-2 pe-4 py-3 text-center font-bold whitespace-nowrap">נק׳</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {sorted.map((team, i) => {
                  const zone = i === 0 ? "ff" : i <= 6 ? "po" : "none"
                  const stripe = zone === "ff" ? "before:bg-gold" : zone === "po" ? "before:bg-brand" : "before:bg-transparent"
                  const d = diff(team)
                  return (
                  <motion.tr
                    key={team.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className={`group relative transition-colors before:absolute before:inset-y-0 before:right-0 before:w-1 ${stripe} ${
                      i === 0
                        ? "bg-gold/[0.08] hover:bg-gold/[0.14]"
                        : i % 2 === 0
                          ? "bg-surface-inset/40 hover:bg-surface-inset/80"
                          : "hover:bg-surface-inset/50"
                    }`}
                  >
                    <td className="ps-4 pe-2 py-3">
                      <div className={`grid size-7 place-items-center rounded-lg text-xs font-black tabular-nums ${
                        i === 0 ? "bg-gold text-surface-page" :
                        i <= 6 ? "bg-brand/[0.12] text-brand-strong dark:text-brand-light" :
                        "bg-surface-chip text-fg-muted"
                      }`}>
                        {i + 1}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <TeamLogo team={team} size={8} />
                        <TeamLink team={team} className="font-bold text-fg-strong text-sm truncate hover:text-brand hover:underline underline-offset-2 decoration-brand/40 transition-colors">{team.name}</TeamLink>
                        {zone === "ff" && <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded font-bold bg-gold/[0.15] text-gold">FF</span>}
                        {zone === "po" && <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded font-bold bg-brand/[0.12] text-brand-strong dark:text-brand-light">PO</span>}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-center tabular-nums text-fg-muted">{played(team)}</td>
                    <td className="px-2 py-3 text-center tabular-nums font-bold text-pos">{team.wins || 0}</td>
                    <td className="px-2 py-3 text-center tabular-nums text-fg-subtle">{team.ties || 0}</td>
                    <td className="px-2 py-3 text-center tabular-nums font-bold text-neg">{team.losses || 0}</td>
                    <td className="px-2 py-3 text-center tabular-nums text-fg-muted">{team.goals_for || 0}</td>
                    <td className="px-2 py-3 text-center tabular-nums text-fg-muted">{team.goals_against || 0}</td>
                    <td className="px-2 py-3 text-center">
                      <span dir="ltr" className={`inline-block font-bold text-sm tabular-nums ${d > 0 ? "text-pos" : d < 0 ? "text-neg" : "text-fg-subtle"}`}>
                        {d > 0 ? "+" : ""}{d}
                      </span>
                    </td>
                    <td className="ps-2 pe-4 py-3 text-center">
                      <span className="stat-num text-lg text-brand">{team.points || 0}</span>
                    </td>
                  </motion.tr>
                )})}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="px-4 py-3 bg-surface-inset border-t border-line-subtle flex gap-4 text-[11px] font-medium text-fg-muted">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-gold" /> Final Four ישיר</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-brand" /> פלייאוף</span>
          </div>
        </motion.div>
      )}

      {/* Playoff Tab */}
      {activeTab === "playoff" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {first && (
            <div className="card p-5 border-amber-200 dark:border-amber-800 bg-gradient-to-l from-amber-50 to-white dark:from-amber-950/30 dark:to-slate-800">
              <div className="flex items-center gap-4">
                <TeamLogo team={first} size={14} />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1"><Crown className="w-3.5 h-3.5" /> מעפילה ישירה ל-Final Four</p>
                  <h3 className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">
                    <TeamLink team={first} className="hover:text-brand transition-colors">{first.name}</TeamLink>
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{first.points} נקודות • מקום ראשון</p>
                </div>
              </div>
            </div>
          )}

          <div className="card p-5">
            <h3 className="font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <Swords className="w-5 h-5 text-orange-500" /> זוגות הפלייאוף
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">כל זוג משחק סדרה של שני משחקים. המנצח עולה ל-Final Four.</p>

            <div className="space-y-3">
              {matchups.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700"
                >
                  <span className="text-xs font-bold text-white bg-blue-500 w-6 h-6 rounded-lg flex items-center justify-center shrink-0">{m.series}</span>

                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <TeamLogo team={m.t1} size={10} />
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-slate-900 dark:text-white truncate"><TeamLink team={m.t1} className="hover:text-brand transition-colors">{m.t1?.name}</TeamLink></p>
                      <p className="text-[11px] text-slate-400">מקום {m.p1} • {m.t1?.points} נק׳</p>
                    </div>
                  </div>

                  <div className="px-3 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs font-extrabold text-slate-500 dark:text-slate-400">VS</div>

                  <div className="flex items-center gap-2.5 flex-1 min-w-0 flex-row-reverse">
                    <TeamLogo team={m.t2} size={10} />
                    <div className="min-w-0 text-left">
                      <p className="font-semibold text-sm text-slate-900 dark:text-white truncate"><TeamLink team={m.t2} className="hover:text-brand transition-colors">{m.t2?.name}</TeamLink></p>
                      <p className="text-[11px] text-slate-400">מקום {m.p2} • {m.t2?.points} נק׳</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <h4 className="font-semibold text-sm text-slate-700 dark:text-slate-300 mb-2">איך זה עובד?</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-500 dark:text-slate-400">
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <Crown className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <span>מקום ראשון עולה ישירות ל-Final Four</span>
              </div>
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <Swords className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <span>כל זוג משחק סדרה של שני משחקים</span>
              </div>
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <Trophy className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                <span>4 קבוצות מגיעות ל-Final Four</span>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {seniorTeams.length === 0 && !error && (
        <div className="text-center py-16">
          <Users className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <h3 className="text-lg font-semibold text-slate-500 dark:text-slate-400">אין קבוצות רשומות</h3>
        </div>
      )}
    </div>
  )
}
