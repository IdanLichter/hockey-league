import { useState, useEffect } from "react"
import { getGames, getTeams, getPlayers, getReferees, getGameStatsByGameId } from "@/lib/api"
import { Calendar, Clock, MapPin, Trophy, Shield, X, FileText, ChevronDown } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { format } from "date-fns"
import TeamLogo from "@/components/TeamLogo"

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

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      const [g, t, p, r] = await Promise.all([getGames(), getTeams(), getPlayers(), getReferees()])
      setGames(g); setTeams(t); setPlayers(p); setReferees(r)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const teamsMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const playersMap = Object.fromEntries(players.map(p => [p.id, p]))
  const teamName = (id) => teamsMap[id]?.name || '—'

  const refInfo = (game) => {
    if (!game.referee_id) return null
    const pool = game.referee_type === 'player' ? players : referees
    const ref = pool.find(r => r.id === game.referee_id)
    return ref ? `${ref.first_name} ${ref.last_name}` : null
  }

  const toggleStats = async (gameId) => {
    if (expandedGame === gameId) { setExpandedGame(null); setGameStatsData(null); return }
    try {
      const stats = await getGameStatsByGameId(gameId)
      setGameStatsData(stats); setExpandedGame(gameId)
    } catch (err) { console.error(err) }
  }

  const statusCfg = {
    scheduled: { label: "מתוכנן", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
    waiting_result: { label: "ממתין", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
    in_progress: { label: "במהלך", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
    completed: { label: "הסתיים", cls: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400" },
    postponed: { label: "נדחה", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  }

  const filtered = games.filter(g => {
    if (g.game_type !== activeCompetition) return false
    if (statusFilter !== "all" && g.status !== statusFilter) return false
    if (teamFilter !== "all" && g.home_team_id !== teamFilter && g.away_team_id !== teamFilter) return false
    if (dateFilter && format(new Date(g.game_date), 'yyyy-MM-dd') !== dateFilter) return false
    return true
  })

  const completed = filtered.filter(g => g.status === 'completed')
  const upcoming = filtered.filter(g => ['scheduled', 'in_progress', 'waiting_result'].includes(g.status))
    .sort((a, b) => new Date(a.game_date) - new Date(b.game_date))

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-orange-500 border-t-transparent" />
      </div>
    )
  }

  const GameCard = ({ game }) => {
    const done = game.status === "completed"
    const status = statusCfg[game.status] || statusCfg.completed
    const ref = refInfo(game)
    const open = expandedGame === game.id
    const home = teamsMap[game.home_team_id]
    const away = teamsMap[game.away_team_id]

    return (
      <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card-hover overflow-hidden">
        <div className="p-4 sm:p-5">
          {/* Tags row */}
          <div className="flex items-center gap-2 mb-3">
            <span className={`stat-pill ${status.cls}`}>{status.label}</span>
            {game.game_type === 'פלייאוף' && <span className="stat-pill bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">פלייאוף</span>}
            {game.series_game && <span className="stat-pill bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">משחק {game.series_game}</span>}
          </div>

          {/* Match row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <TeamLogo team={home} size={10} />
              <div className="min-w-0">
                <p className="font-bold text-slate-900 dark:text-white text-sm truncate">{home?.name}</p>
                <p className="text-[11px] text-slate-400">בית</p>
              </div>
            </div>

            <div className="px-4 text-center shrink-0">
              {done ? (
                <div className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white tabular-nums">
                  <span>{game.home_score}</span>
                  <span className="text-slate-300 dark:text-slate-600 mx-1">:</span>
                  <span>{game.away_score}</span>
                </div>
              ) : (
                <div className="text-lg font-bold text-slate-300 dark:text-slate-600">
                  {format(new Date(game.game_date), "HH:mm")}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 flex-1 min-w-0 flex-row-reverse">
              <TeamLogo team={away} size={10} />
              <div className="min-w-0 text-left">
                <p className="font-bold text-slate-900 dark:text-white text-sm truncate">{away?.name}</p>
                <p className="text-[11px] text-slate-400">חוץ</p>
              </div>
            </div>
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{format(new Date(game.game_date), "d/M/yyyy")}</span>
            <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{game.venue || '—'}</span>
            {ref && <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5" />{ref}</span>}
            {done && (
              <button onClick={() => toggleStats(game.id)} className="mr-auto flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                <FileText className="w-3.5 h-3.5" />
                {open ? 'סגור' : 'פרטים'}
                <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>

          {game.notes && (
            <div className="mt-3 p-2.5 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-xs text-amber-700 dark:text-amber-300 border border-amber-100 dark:border-amber-800/50">
              {game.notes}
            </div>
          )}
        </div>

        {/* Expanded stats */}
        <AnimatePresence>
          {open && gameStatsData && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="px-5 pb-5">
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white mb-3">סטטיסטיקות שחקנים</h4>
                  <div className="grid grid-cols-2 gap-6">
                    {[game.home_team_id, game.away_team_id].map(tid => (
                      <div key={tid}>
                        <h5 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">{teamName(tid)}</h5>
                        <div className="space-y-1">
                          {gameStatsData.filter(s => playersMap[s.player_id]?.team_id === tid).map(stat => {
                            const p = playersMap[stat.player_id]
                            return (
                              <div key={stat.id} className="flex items-center justify-between py-1 text-xs">
                                <span className="text-slate-700 dark:text-slate-300">{p?.first_name} {p?.last_name}</span>
                                <div className="flex gap-1.5">
                                  {stat.goals > 0 && <span className="stat-pill bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 !py-0 !px-1.5">⚽ {stat.goals}</span>}
                                  {stat.blue_cards > 0 && <span className="stat-pill bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 !py-0 !px-1.5">🟦 {stat.blue_cards}</span>}
                                  {stat.red_cards > 0 && <span className="stat-pill bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 !py-0 !px-1.5">🟥 {stat.red_cards}</span>}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    )
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-5">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="page-title flex items-center gap-2.5">
          <Calendar className="w-7 h-7 text-orange-500" /> משחקים
        </h1>
        <p className="page-subtitle mt-1">לוח משחקים ותוצאות עונת 2025-26</p>
      </motion.div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="tab-bar sm:w-auto">
          <button onClick={() => setActiveCompetition("ליגה")} className={activeCompetition === "ליגה" ? "tab-active" : "tab-inactive"}>
            <Trophy className="w-4 h-4" /> ליגה
          </button>
          <button onClick={() => setActiveCompetition("פלייאוף")} className={activeCompetition === "פלייאוף" ? "tab-active" : "tab-inactive"}>
            <Shield className="w-4 h-4" /> פלייאוף
          </button>
        </div>
        <div className="flex gap-2 flex-1 flex-wrap">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="filter-select flex-1 min-w-[120px]">
            <option value="all">כל הסטטוסים</option>
            <option value="scheduled">מתוכנן</option>
            <option value="completed">הסתיים</option>
            <option value="waiting_result">ממתין</option>
          </select>
          <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} className="filter-select flex-1 min-w-[120px]">
            <option value="all">כל הקבוצות</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div className="relative flex-1 min-w-[130px]">
            <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="filter-input w-full" />
            {dateFilter && <button onClick={() => setDateFilter('')} className="absolute left-2 top-1/2 -translate-y-1/2"><X className="w-4 h-4 text-slate-400" /></button>}
          </div>
        </div>
      </div>

      {/* Games */}
      <div className="space-y-6">
        {upcoming.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2 uppercase tracking-wide">
              <Clock className="w-4 h-4 text-blue-500" /> משחקים קרובים
            </h2>
            <div className="grid gap-3">{upcoming.map(g => <GameCard key={g.id} game={g} />)}</div>
          </div>
        )}
        {completed.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2 uppercase tracking-wide">
              <Trophy className="w-4 h-4 text-emerald-500" /> תוצאות
            </h2>
            <div className="grid gap-3">{completed.map(g => <GameCard key={g.id} game={g} />)}</div>
          </div>
        )}
        {filtered.length === 0 && (
          <div className="text-center py-16">
            <Calendar className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <h3 className="text-lg font-semibold text-slate-500 dark:text-slate-400">אין משחקים תואמים</h3>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">נסה לשנות את הסינונים</p>
          </div>
        )}
      </div>
    </div>
  )
}
