import { useState, useEffect } from "react"
import { getGames, getTeams, getPlayers, getReferees, getGameStatsByGameId } from "@/lib/api"
import { Calendar, Clock, MapPin, Trophy, Shield, Filter, X, FileText } from "lucide-react"
import { motion } from "framer-motion"
import { format } from "date-fns"

export default function Games() {
  const [games, setGames] = useState([])
  const [teams, setTeams] = useState([])
  const [players, setPlayers] = useState([])
  const [referees, setReferees] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeCompetition, setActiveCompetition] = useState("ליגה")
  const [statusFilter, setStatusFilter] = useState("all")
  const [teamFilter, setTeamFilter] = useState("all")
  const [dateFilter, setDateFilter] = useState("")
  const [expandedGame, setExpandedGame] = useState(null)
  const [gameStatsData, setGameStatsData] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [gamesData, teamsData, playersData, refereesData] = await Promise.all([
        getGames(), getTeams(), getPlayers(), getReferees()
      ])
      setGames(gamesData)
      setTeams(teamsData)
      setPlayers(playersData)
      setReferees(refereesData)
    } catch (err) {
      console.error("Error loading data:", err)
    } finally {
      setLoading(false)
    }
  }

  const teamsMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const playersMap = Object.fromEntries(players.map(p => [p.id, p]))

  const getTeamName = (id) => teamsMap[id]?.name || 'לא ידוע'
  const getTeamColor = (id) => teamsMap[id]?.primary_color || '#f97316'

  const getRefereeInfo = (game) => {
    if (!game.referee_id) return null
    if (game.referee_type === 'player') {
      const ref = players.find(p => p.id === game.referee_id)
      return ref ? `${ref.first_name} ${ref.last_name}` : null
    }
    const ref = referees.find(r => r.id === game.referee_id)
    return ref ? `${ref.first_name} ${ref.last_name}` : null
  }

  const loadGameStats = async (gameId) => {
    if (expandedGame === gameId) {
      setExpandedGame(null)
      setGameStatsData(null)
      return
    }
    try {
      const stats = await getGameStatsByGameId(gameId)
      setGameStatsData(stats)
      setExpandedGame(gameId)
    } catch (err) {
      console.error(err)
    }
  }

  const statusLabels = {
    scheduled: { label: "מתוכנן", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
    waiting_result: { label: "ממתין לתוצאה", cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300" },
    in_progress: { label: "במהלך", cls: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
    completed: { label: "הסתיים", cls: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300" },
    postponed: { label: "נדחה", cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  }

  const filteredGames = games.filter(game => {
    if (game.game_type !== activeCompetition) return false
    if (statusFilter !== "all" && game.status !== statusFilter) return false
    if (teamFilter !== "all" && game.home_team_id !== teamFilter && game.away_team_id !== teamFilter) return false
    if (dateFilter && format(new Date(game.game_date), 'yyyy-MM-dd') !== dateFilter) return false
    return true
  })

  const completedGames = filteredGames.filter(g => g.status === 'completed')
  const upcomingGames = filteredGames.filter(g => ['scheduled', 'in_progress', 'waiting_result'].includes(g.status))
    .sort((a, b) => new Date(a.game_date) - new Date(b.game_date))

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-orange-600 mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400">טוען נתוני משחקים...</p>
        </div>
      </div>
    )
  }

  const GameCard = ({ game }) => {
    const isCompleted = game.status === "completed"
    const status = statusLabels[game.status] || { label: game.status, cls: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300" }
    const refereeInfo = getRefereeInfo(game)
    const isExpanded = expandedGame === game.id

    return (
      <motion.div layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className={`bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border rounded-xl overflow-hidden ${
          game.status === 'waiting_result' ? 'border-yellow-200 bg-yellow-50/60 dark:border-yellow-700 dark:bg-yellow-900/20' :
          game.status === 'in_progress' ? 'border-green-200 bg-green-50/60 dark:border-green-700 dark:bg-green-900/20' :
          'border-slate-200/60 dark:border-slate-700/60'
        }`}>
          <div className="p-4">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    game.game_type === 'פלייאוף' ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                  }`}>
                    {game.game_type}
                  </span>
                  {game.is_neutral && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">ניטרלי</span>}
                  {game.series_game && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">משחק {game.series_game}</span>}
                </div>

                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full shrink-0" style={{ backgroundColor: getTeamColor(game.home_team_id) }} />
                    <span className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">{getTeamName(game.home_team_id)}</span>
                  </div>
                  <span className="font-bold text-slate-400 dark:text-slate-500">vs</span>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full shrink-0" style={{ backgroundColor: getTeamColor(game.away_team_id) }} />
                    <span className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">{getTeamName(game.away_team_id)}</span>
                  </div>
                </div>
              </div>

              <div className="text-center mr-4">
                {isCompleted && (
                  <div className="text-2xl font-bold tracking-tight mb-1 text-slate-900 dark:text-white">
                    {game.home_score} - {game.away_score}
                  </div>
                )}
                <span className={`text-xs px-2 py-1 rounded-full ${status.cls}`}>
                  {game.status === 'scheduled' && format(new Date(game.game_date), "HH:mm") + " • "}
                  {status.label}
                </span>
              </div>
            </div>
          </div>

          <div className="px-4 pb-4 text-sm text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-4 border-t border-slate-100 dark:border-slate-700/50 pt-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                <span>{format(new Date(game.game_date), "d/M/yyyy")}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                <span>{format(new Date(game.game_date), "HH:mm")}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4" />
                <span>{game.venue || 'לא צוין'}</span>
              </div>
              {refereeInfo && (
                <div className="flex items-center gap-1.5">
                  <Shield className="w-4 h-4" />
                  <span>שופט: {refereeInfo}</span>
                </div>
              )}
              {isCompleted && (
                <button
                  onClick={() => loadGameStats(game.id)}
                  className="mr-auto flex items-center gap-1 text-xs px-3 py-1.5 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <FileText className="w-3.5 h-3.5" />
                  {isExpanded ? 'סגור פרטים' : 'טופס משחק'}
                </button>
              )}
            </div>

            {game.notes && (
              <div className="mt-3 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-300">
                {game.notes}
              </div>
            )}

            {isExpanded && gameStatsData && (
              <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-700/40 rounded-lg border border-slate-200 dark:border-slate-600">
                <h4 className="font-semibold text-slate-900 dark:text-white mb-3">סטטיסטיקות שחקנים</h4>
                <div className="grid grid-cols-2 gap-4">
                  {/* Home team stats */}
                  <div>
                    <h5 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">{getTeamName(game.home_team_id)}</h5>
                    {gameStatsData.filter(s => {
                      const p = playersMap[s.player_id]
                      return p && p.team_id === game.home_team_id
                    }).map(stat => {
                      const p = playersMap[stat.player_id]
                      return (
                        <div key={stat.id} className="flex items-center justify-between py-1 text-xs">
                          <span className="text-slate-700 dark:text-slate-300">{p?.first_name} {p?.last_name}</span>
                          <div className="flex gap-2">
                            {stat.goals > 0 && <span className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 px-1.5 rounded">⚽ {stat.goals}</span>}
                            {stat.blue_cards > 0 && <span className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 px-1.5 rounded">🟦 {stat.blue_cards}</span>}
                            {stat.red_cards > 0 && <span className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 px-1.5 rounded">🟥 {stat.red_cards}</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {/* Away team stats */}
                  <div>
                    <h5 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">{getTeamName(game.away_team_id)}</h5>
                    {gameStatsData.filter(s => {
                      const p = playersMap[s.player_id]
                      return p && p.team_id === game.away_team_id
                    }).map(stat => {
                      const p = playersMap[stat.player_id]
                      return (
                        <div key={stat.id} className="flex items-center justify-between py-1 text-xs">
                          <span className="text-slate-700 dark:text-slate-300">{p?.first_name} {p?.last_name}</span>
                          <div className="flex gap-2">
                            {stat.goals > 0 && <span className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 px-1.5 rounded">⚽ {stat.goals}</span>}
                            {stat.blue_cards > 0 && <span className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 px-1.5 rounded">🟦 {stat.blue_cards}</span>}
                            {stat.red_cards > 0 && <span className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 px-1.5 rounded">🟥 {stat.red_cards}</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
          <div className="flex items-center gap-3">
            <Calendar className="w-8 h-8 text-orange-600" />
            <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-slate-900 via-orange-800 to-slate-900 dark:from-white dark:via-orange-400 dark:to-white bg-clip-text text-transparent">
              משחקים
            </h1>
          </div>
          <p className="text-slate-600 dark:text-slate-400 text-lg">לוח משחקים ותוצאות עונת 2024-25</p>
        </motion.div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch">
          <div className="flex bg-white/60 dark:bg-slate-800/60 rounded-lg p-1 border border-slate-200/60 dark:border-slate-700/60">
            <button
              onClick={() => setActiveCompetition("ליגה")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                activeCompetition === "ליגה" ? "bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-400"
              }`}
            >
              <Trophy className="w-4 h-4" /> ליגה
            </button>
            <button
              onClick={() => setActiveCompetition("פלייאוף")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                activeCompetition === "פלייאוף" ? "bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-400"
              }`}
            >
              <Shield className="w-4 h-4" /> פלייאוף
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 flex-1">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-white/60 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 rounded-lg px-3 py-2 text-sm flex-1 text-slate-900 dark:text-slate-200"
            >
              <option value="all">כל הסטטוסים</option>
              <option value="scheduled">מתוכנן</option>
              <option value="completed">הסתיים</option>
              <option value="waiting_result">ממתין לתוצאה</option>
            </select>

            <select
              value={teamFilter}
              onChange={e => setTeamFilter(e.target.value)}
              className="bg-white/60 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 rounded-lg px-3 py-2 text-sm flex-1 text-slate-900 dark:text-slate-200"
            >
              <option value="all">כל הקבוצות</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>

            <div className="relative flex-1">
              <input
                type="date"
                value={dateFilter}
                onChange={e => setDateFilter(e.target.value)}
                className="bg-white/60 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 rounded-lg px-3 py-2 text-sm w-full text-slate-900 dark:text-slate-200"
              />
              {dateFilter && (
                <button onClick={() => setDateFilter('')} className="absolute left-2 top-1/2 -translate-y-1/2">
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Games Lists */}
        <div className="space-y-8">
          {upcomingGames.length > 0 && (
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" /> משחקים קרובים
              </h2>
              <div className="grid gap-4">
                {upcomingGames.map(game => <GameCard key={game.id} game={game} />)}
              </div>
            </div>
          )}

          {completedGames.length > 0 && (
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-green-600" /> תוצאות
              </h2>
              <div className="grid gap-4">
                {completedGames.map(game => <GameCard key={game.id} game={game} />)}
              </div>
            </div>
          )}

          {filteredGames.length === 0 && (
            <div className="text-center py-12">
              <Calendar className="w-16 h-16 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
              <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-400">אין משחקים תואמים</h3>
              <p className="text-slate-500 dark:text-slate-500">נסה לשנות את הסינונים</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
