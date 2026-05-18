import { useState, useEffect } from "react"
import { getTeams, getGames } from "@/lib/api"
import { Trophy, Crown, Swords, Calendar } from "lucide-react"
import { motion } from "framer-motion"
import { format } from "date-fns"

export default function FinalFour() {
  const [teams, setTeams] = useState([])
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [t, g] = await Promise.all([getTeams(), getGames()])
      setTeams(t)
      setGames(g)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const teamsMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const getTeamName = (id) => teamsMap[id]?.name || 'לא ידוע'
  const getTeamColor = (id) => teamsMap[id]?.primary_color || '#f97316'

  const sortedTeams = [...teams].sort((a, b) => (b.points || 0) - (a.points || 0))
  const firstPlace = sortedTeams[0]

  const playoffGames = games.filter(g => g.game_type === 'פלייאוף')
  const finalFourGames = games.filter(g => g.game_type === 'Final Four')

  const playoffSeries = (() => {
    if (sortedTeams.length < 7) return []
    return [
      { name: "סדרה A", team1: sortedTeams[1], team2: sortedTeams[6], pos1: 2, pos2: 7 },
      { name: "סדרה B", team1: sortedTeams[2], team2: sortedTeams[5], pos1: 3, pos2: 6 },
      { name: "סדרה C", team1: sortedTeams[3], team2: sortedTeams[4], pos1: 4, pos2: 5 },
    ]
  })()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-orange-600 mx-auto" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
          <div className="flex items-center gap-3">
            <Trophy className="w-8 h-8 text-orange-600" />
            <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-slate-900 via-orange-800 to-slate-900 dark:from-white dark:via-orange-400 dark:to-white bg-clip-text text-transparent">
              Final Four
            </h1>
          </div>
          <p className="text-slate-600 dark:text-slate-400 text-lg">שלב הגמר - עונת 2024-25</p>
        </motion.div>

        {/* Bracket Visual */}
        <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-6">
          <h2 className="font-bold text-lg mb-6 flex items-center gap-2 text-slate-900 dark:text-white">
            <Swords className="w-5 h-5 text-orange-600" /> מבנה הטורניר
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Playoff Round */}
            <div>
              <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-4 text-center">סיבוב ראשון (פלייאוף)</h3>
              <div className="space-y-4">
                {playoffSeries.map((series, i) => {
                  const seriesGames = playoffGames.filter(g =>
                    (g.home_team_id === series.team1?.id && g.away_team_id === series.team2?.id) ||
                    (g.home_team_id === series.team2?.id && g.away_team_id === series.team1?.id)
                  )
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="border border-slate-200 dark:border-slate-600 rounded-xl p-4 bg-white dark:bg-slate-800"
                    >
                      <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">{series.name}</span>
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-700/40 rounded-lg">
                          <div className="w-6 h-6 rounded-full" style={{ backgroundColor: getTeamColor(series.team1?.id) }} />
                          <span className="font-semibold text-sm flex-1 text-slate-900 dark:text-white">{series.team1?.name}</span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">#{series.pos1}</span>
                        </div>
                        <div className="text-center text-xs text-slate-400 dark:text-slate-500">vs</div>
                        <div className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-700/40 rounded-lg">
                          <div className="w-6 h-6 rounded-full" style={{ backgroundColor: getTeamColor(series.team2?.id) }} />
                          <span className="font-semibold text-sm flex-1 text-slate-900 dark:text-white">{series.team2?.name}</span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">#{series.pos2}</span>
                        </div>
                      </div>

                      {seriesGames.length > 0 && (
                        <div className="mt-3 space-y-1">
                          {seriesGames.map(g => (
                            <div key={g.id} className="flex items-center justify-between text-xs p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
                              <span className="text-slate-700 dark:text-slate-300">משחק {g.series_game}</span>
                              <span className="text-slate-600 dark:text-slate-400">{format(new Date(g.game_date), "d/M/yy")}</span>
                              {g.status === 'completed' ? (
                                <span className="font-bold text-slate-900 dark:text-white">{g.home_score} - {g.away_score}</span>
                              ) : (
                                <span className="text-blue-600 dark:text-blue-400">{g.status === 'scheduled' ? 'מתוכנן' : g.status}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )
                })}
              </div>
            </div>

            {/* Semi Finals / Final Four */}
            <div>
              <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-4 text-center">חצי גמר</h3>
              <div className="space-y-4">
                {firstPlace && (
                  <div className="border-2 border-yellow-300 dark:border-yellow-600 rounded-xl p-4 bg-gradient-to-br from-yellow-50 to-white dark:from-yellow-900/30 dark:to-slate-800">
                    <div className="flex items-center gap-2 mb-2">
                      <Crown className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                      <span className="text-xs font-semibold text-yellow-700 dark:text-yellow-300">מקום ראשון</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full" style={{ backgroundColor: firstPlace.primary_color || '#f97316' }} />
                      <span className="font-bold text-slate-900 dark:text-white">{firstPlace.name}</span>
                    </div>
                    <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">עלתה אוטומטית ל-Final Four</p>
                  </div>
                )}

                <div className="border border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-4 text-center text-sm text-slate-400 dark:text-slate-500">
                  ממתין למנצחי הפלייאוף
                </div>
                <div className="border border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-4 text-center text-sm text-slate-400 dark:text-slate-500">
                  ממתין למנצחי הפלייאוף
                </div>
              </div>
            </div>

            {/* Final */}
            <div>
              <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-4 text-center">גמר</h3>
              <div className="border border-dashed border-orange-300 dark:border-orange-700 rounded-xl p-8 text-center bg-gradient-to-br from-orange-50/50 to-white dark:from-orange-900/20 dark:to-slate-800">
                <Trophy className="w-12 h-12 text-orange-400 dark:text-orange-500 mx-auto mb-3" />
                <p className="text-slate-400 dark:text-slate-500 text-sm">הגמר טרם נקבע</p>
                <p className="text-xs text-slate-300 dark:text-slate-600 mt-1">ייקבע לאחר סיום הפלייאוף</p>
              </div>
            </div>
          </div>
        </div>

        {/* Playoff Games Schedule */}
        {playoffGames.length > 0 && (
          <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-6">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-900 dark:text-white">
              <Calendar className="w-5 h-5 text-blue-600" /> לוח משחקי פלייאוף
            </h2>
            <div className="grid gap-3">
              {playoffGames.sort((a, b) => new Date(a.game_date) - new Date(b.game_date)).map(game => (
                <div key={game.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/40 rounded-lg border border-slate-100 dark:border-slate-600">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full" style={{ backgroundColor: getTeamColor(game.home_team_id) }} />
                    <span className="font-semibold text-sm text-slate-900 dark:text-white">{getTeamName(game.home_team_id)}</span>
                    <span className="text-slate-400 dark:text-slate-500 text-sm">vs</span>
                    <span className="font-semibold text-sm text-slate-900 dark:text-white">{getTeamName(game.away_team_id)}</span>
                    <div className="w-8 h-8 rounded-full" style={{ backgroundColor: getTeamColor(game.away_team_id) }} />
                  </div>
                  <div className="text-left text-sm">
                    <p className="font-medium text-slate-900 dark:text-white">{format(new Date(game.game_date), "d/M/yy")}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {game.status === 'completed' ? `${game.home_score} - ${game.away_score}` : 'מתוכנן'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
