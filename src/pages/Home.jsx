import { useState, useEffect } from "react"
import { getTeams } from "@/lib/api"
import { Trophy, Users, Crown, Swords, RefreshCw } from "lucide-react"
import { motion } from "framer-motion"
import TeamLogo from "@/components/TeamLogo"

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
  const sorted = [...teams].sort((a, b) => (b.points || 0) - (a.points || 0))
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
        <h1 className="page-title flex items-center gap-2.5">
          <Trophy className="w-7 h-7 text-orange-500" />
          טבלת הליגה
        </h1>
        <p className="page-subtitle mt-1">דירוג קבוצות עונת 2025-26</p>
      </motion.div>

      {error && (
        <div className="card p-4 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 flex items-center justify-between">
          <span className="text-red-700 dark:text-red-400 text-sm font-medium">{error}</span>
          <button onClick={loadTeams} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> נסה שוב
          </button>
        </div>
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
                <tr className="bg-slate-900 dark:bg-slate-800 text-white text-xs uppercase tracking-wider">
                  <th className="px-3 py-3 text-right font-semibold w-10">#</th>
                  <th className="px-3 py-3 text-right font-semibold">קבוצה</th>
                  <th className="px-3 py-3 text-center font-semibold">מש׳</th>
                  <th className="hidden sm:table-cell px-3 py-3 text-center font-semibold">נ</th>
                  <th className="hidden sm:table-cell px-3 py-3 text-center font-semibold">ת</th>
                  <th className="hidden sm:table-cell px-3 py-3 text-center font-semibold">ה</th>
                  <th className="hidden md:table-cell px-3 py-3 text-center font-semibold">זכות</th>
                  <th className="hidden md:table-cell px-3 py-3 text-center font-semibold">חובה</th>
                  <th className="px-3 py-3 text-center font-semibold">הפרש</th>
                  <th className="px-3 py-3 text-center font-semibold">נק׳</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {sorted.map((team, i) => (
                  <motion.tr
                    key={team.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                      i === 0 ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''
                    }`}
                  >
                    <td className="px-3 py-3">
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${
                        i === 0 ? 'bg-amber-400 text-amber-950' :
                        i === 1 ? 'bg-slate-300 dark:bg-slate-500 text-slate-800 dark:text-white' :
                        i === 2 ? 'bg-orange-300 dark:bg-orange-700 text-orange-900 dark:text-white' :
                        i <= 6 ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' :
                        'text-slate-400 dark:text-slate-500'
                      }`}>
                        {i + 1}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <TeamLogo team={team} size={8} />
                        <div>
                          <span className="font-semibold text-slate-900 dark:text-white text-sm">{team.name}</span>
                          {i === 0 && <span className="mr-2 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded">FF</span>}
                          {i >= 1 && i <= 6 && <span className="mr-2 text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">PO</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center font-medium text-slate-600 dark:text-slate-400">{played(team)}</td>
                    <td className="hidden sm:table-cell px-3 py-3 text-center font-bold text-emerald-600 dark:text-emerald-400">{team.wins || 0}</td>
                    <td className="hidden sm:table-cell px-3 py-3 text-center text-slate-500 dark:text-slate-400">{team.ties || 0}</td>
                    <td className="hidden sm:table-cell px-3 py-3 text-center font-bold text-red-500 dark:text-red-400">{team.losses || 0}</td>
                    <td className="hidden md:table-cell px-3 py-3 text-center text-slate-600 dark:text-slate-400">{team.goals_for || 0}</td>
                    <td className="hidden md:table-cell px-3 py-3 text-center text-slate-600 dark:text-slate-400">{team.goals_against || 0}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`font-bold text-sm ${diff(team) > 0 ? 'text-emerald-600 dark:text-emerald-400' : diff(team) < 0 ? 'text-red-500 dark:text-red-400' : 'text-slate-400'}`}>
                        {diff(team) > 0 ? '+' : ''}{diff(team)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="bg-slate-900 dark:bg-orange-500 text-white font-bold text-xs px-2.5 py-1 rounded-md min-w-[28px] inline-block">
                        {team.points || 0}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-700 flex gap-4 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-amber-400" /> Final Four ישיר</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-blue-400" /> פלייאוף</span>
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
                  <h3 className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">{first.name}</h3>
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
                      <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">{m.t1?.name}</p>
                      <p className="text-[11px] text-slate-400">מקום {m.p1} • {m.t1?.points} נק׳</p>
                    </div>
                  </div>

                  <div className="px-3 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs font-extrabold text-slate-500 dark:text-slate-400">VS</div>

                  <div className="flex items-center gap-2.5 flex-1 min-w-0 flex-row-reverse">
                    <TeamLogo team={m.t2} size={10} />
                    <div className="min-w-0 text-left">
                      <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">{m.t2?.name}</p>
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

      {teams.length === 0 && !error && (
        <div className="text-center py-16">
          <Users className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <h3 className="text-lg font-semibold text-slate-500 dark:text-slate-400">אין קבוצות רשומות</h3>
        </div>
      )}
    </div>
  )
}
