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

  useEffect(() => {
    loadTeams()
  }, [])

  const loadTeams = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getTeams('points', false)
      setTeams(data)
    } catch (err) {
      setError("שגיאה בטעינת נתוני קבוצות")
    } finally {
      setLoading(false)
    }
  }

  const getGoalDifferential = (team) => (team.goals_for || 0) - (team.goals_against || 0)

  const getPlayoffMatchups = () => {
    if (!teams || teams.length < 7) return []
    const sorted = [...teams].sort((a, b) => (b.points || 0) - (a.points || 0))
    return [
      { position1: 2, team1: sorted[1], position2: 7, team2: sorted[6], series: "סדרה A" },
      { position1: 3, team1: sorted[2], position2: 6, team2: sorted[5], series: "סדרה B" },
      { position1: 4, team1: sorted[3], position2: 5, team2: sorted[4], series: "סדרה C" },
    ]
  }

  const sortedTeams = [...teams].sort((a, b) => (b.points || 0) - (a.points || 0))
  const firstPlace = sortedTeams[0] || null
  const playoffMatchups = getPlayoffMatchups()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-orange-600 mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400">טוען נתוני קבוצות...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
          <div className="flex items-center gap-3">
            <Trophy className="w-8 h-8 text-orange-600" />
            <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-slate-900 via-orange-800 to-slate-900 dark:from-white dark:via-orange-400 dark:to-white bg-clip-text text-transparent">
              טבלת הליגה
            </h1>
          </div>
          <p className="text-slate-600 dark:text-slate-400 text-lg">דירוג קבוצות עונת 2024-25</p>
        </motion.div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center justify-between">
            <span className="text-red-800 dark:text-red-300">{error}</span>
            <button onClick={loadTeams} className="flex items-center gap-2 px-3 py-1 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">
              <RefreshCw className="w-4 h-4" /> נסה שוב
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg p-1 border border-slate-200/60 dark:border-slate-700/60">
          <button
            onClick={() => setActiveTab("league")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${
              activeTab === "league" ? "bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Trophy className="w-4 h-4" /> טבלת הליגה
          </button>
          <button
            onClick={() => setActiveTab("playoff")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${
              activeTab === "playoff" ? "bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Swords className="w-4 h-4" /> מצב הפלייאוף
          </button>
        </div>

        {/* League Table */}
        {activeTab === "league" && (
          <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-200/60 dark:border-slate-700/60">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
                <Trophy className="w-5 h-5 text-orange-600" />
                טבלת הליגה הרגילה
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-slate-50/60 dark:bg-slate-700/40 border-b border-slate-200 dark:border-slate-700">
                  <tr className="text-right">
                    <th className="px-2 sm:px-4 py-3 font-semibold text-slate-900 dark:text-slate-200">#</th>
                    <th className="px-2 sm:px-4 py-3 font-semibold text-slate-900 dark:text-slate-200">קבוצה</th>
                    <th className="px-2 sm:px-4 py-3 font-semibold text-slate-900 dark:text-slate-200 text-center">מש׳</th>
                    <th className="hidden md:table-cell px-2 sm:px-4 py-3 font-semibold text-slate-900 dark:text-slate-200 text-center">נ</th>
                    <th className="hidden md:table-cell px-2 sm:px-4 py-3 font-semibold text-slate-900 dark:text-slate-200 text-center">ת</th>
                    <th className="hidden md:table-cell px-2 sm:px-4 py-3 font-semibold text-slate-900 dark:text-slate-200 text-center">ה</th>
                    <th className="hidden lg:table-cell px-2 sm:px-4 py-3 font-semibold text-slate-900 dark:text-slate-200 text-center">זכות</th>
                    <th className="hidden lg:table-cell px-2 sm:px-4 py-3 font-semibold text-slate-900 dark:text-slate-200 text-center">חובה</th>
                    <th className="px-2 sm:px-4 py-3 font-semibold text-slate-900 dark:text-slate-200 text-center">הפרש</th>
                    <th className="px-2 sm:px-4 py-3 font-semibold text-slate-900 dark:text-slate-200 text-center">נק׳</th>
                    <th className="hidden lg:table-cell px-2 sm:px-4 py-3 font-semibold text-slate-900 dark:text-slate-200 text-center">מצב</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTeams.map((team, index) => (
                    <motion.tr
                      key={team.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50/40 dark:hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="px-2 sm:px-4 py-3">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          index === 0 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300' :
                          index === 1 ? 'bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-200' :
                          index === 2 ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300' :
                          'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                        }`}>
                          {index + 1}
                        </div>
                      </td>
                      <td className="px-2 sm:px-4 py-3">
                        <div className="flex items-center gap-2">
                          <TeamLogo team={team} size={6} />
                          <span className="font-semibold text-slate-900 dark:text-white whitespace-nowrap">{team.name}</span>
                        </div>
                      </td>
                      <td className="px-2 sm:px-4 py-3 text-center font-medium text-slate-700 dark:text-slate-300">
                        {(team.wins || 0) + (team.losses || 0) + (team.ties || 0)}
                      </td>
                      <td className="hidden md:table-cell px-2 sm:px-4 py-3 text-center font-bold text-green-600 dark:text-green-400">{team.wins || 0}</td>
                      <td className="hidden md:table-cell px-2 sm:px-4 py-3 text-center text-slate-600 dark:text-slate-400">{team.ties || 0}</td>
                      <td className="hidden md:table-cell px-2 sm:px-4 py-3 text-center font-bold text-red-600 dark:text-red-400">{team.losses || 0}</td>
                      <td className="hidden lg:table-cell px-2 sm:px-4 py-3 text-center text-green-600 dark:text-green-400">{team.goals_for || 0}</td>
                      <td className="hidden lg:table-cell px-2 sm:px-4 py-3 text-center text-red-600 dark:text-red-400">{team.goals_against || 0}</td>
                      <td className="px-2 sm:px-4 py-3 text-center">
                        <span className={`font-bold ${getGoalDifferential(team) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {getGoalDifferential(team) >= 0 ? '+' : ''}{getGoalDifferential(team)}
                        </span>
                      </td>
                      <td className="px-2 sm:px-4 py-3 text-center">
                        <span className="bg-orange-600 text-white font-bold text-xs px-2 py-1 rounded-full">
                          {team.points || 0}
                        </span>
                      </td>
                      <td className="hidden lg:table-cell px-2 sm:px-4 py-3 text-center">
                        {index === 0 && (
                          <span className="bg-yellow-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1 w-fit mx-auto">
                            <Crown className="w-3 h-3" /> Final Four
                          </span>
                        )}
                        {index >= 1 && index <= 6 && (
                          <span className="text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-600 text-xs px-2 py-1 rounded-full">פלייאוף</span>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Playoff Tab */}
        {activeTab === "playoff" && (
          <div className="space-y-6">
            {firstPlace && (
              <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 dark:from-yellow-900/30 dark:to-yellow-800/20 border border-yellow-200 dark:border-yellow-700 rounded-xl p-6">
                <h3 className="flex items-center gap-2 text-yellow-800 dark:text-yellow-300 font-bold text-lg mb-4">
                  <Crown className="w-6 h-6" /> מעפילה אוטומטית ל-Final Four
                </h3>
                <div className="flex items-center gap-4 p-4 bg-white/60 dark:bg-slate-800/60 rounded-lg">
                  <TeamLogo team={firstPlace} size={12} />
                  <div className="flex-1">
                    <h4 className="text-xl font-bold text-slate-900 dark:text-white">{firstPlace.name}</h4>
                    <p className="text-slate-600 dark:text-slate-400">מקום ראשון - {firstPlace.points || 0} נקודות</p>
                  </div>
                  <span className="bg-yellow-500 text-white text-lg px-4 py-2 rounded-full font-bold">מקום 1</span>
                </div>
              </div>
            )}

            <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-6">
              <h3 className="flex items-center gap-2 font-bold text-lg mb-2 text-slate-900 dark:text-white">
                <Swords className="w-5 h-5 text-orange-600" /> זוגות הפלייאוף
              </h3>
              <p className="text-slate-600 dark:text-slate-400 mb-6">כל זוג ישחק שני משחקים (בית וחוץ). המנצח עולה ל-Final Four</p>

              <div className="space-y-4">
                {playoffMatchups.map((matchup, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="p-5 rounded-xl bg-slate-50/60 dark:bg-slate-700/40 border border-slate-200 dark:border-slate-600"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <span className="bg-blue-600 text-white text-xs px-3 py-1 rounded-full font-medium">{matchup.series}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 items-center">
                      <div className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg">
                        <TeamLogo team={matchup.team1} size={10} />
                        <div>
                          <p className="font-semibold text-sm text-slate-900 dark:text-white">{matchup.team1?.name}</p>
                          <span className="text-xs text-slate-500 dark:text-slate-400">מקום {matchup.position1} • {matchup.team1?.points || 0} נק׳</span>
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-orange-600">VS</div>
                      </div>
                      <div className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg">
                        <TeamLogo team={matchup.team2} size={10} />
                        <div>
                          <p className="font-semibold text-sm text-slate-900 dark:text-white">{matchup.team2?.name}</p>
                          <span className="text-xs text-slate-500 dark:text-slate-400">מקום {matchup.position2} • {matchup.team2?.points || 0} נק׳</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="mt-6 p-4 bg-blue-50/60 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <h4 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">הסבר על הפלייאוף:</h4>
                <ul className="text-sm text-blue-800 dark:text-blue-400 space-y-1">
                  <li>• מקום ראשון עולה אוטומטית ל-Final Four</li>
                  <li>• כל זוג ישחק סדרה של שני משחקים (בית וחוץ)</li>
                  <li>• סה״כ 4 קבוצות יגיעו ל-Final Four</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {teams.length === 0 && !error && (
          <div className="text-center py-12">
            <Users className="w-16 h-16 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
            <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-400">אין קבוצות רשומות</h3>
          </div>
        )}
      </div>
    </div>
  )
}
