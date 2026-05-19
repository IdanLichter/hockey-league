import { useState, useEffect } from "react"
import { getPlayers, getTeams } from "@/lib/api"
import { UserCheck, Search, Filter } from "lucide-react"
import { motion } from "framer-motion"
import TeamLogo from "@/components/TeamLogo"

export default function Players() {
  const [players, setPlayers] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [teamFilter, setTeamFilter] = useState("all")
  const [positionFilter, setPositionFilter] = useState("all")
  const [sortBy, setSortBy] = useState("goals")

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [p, t] = await Promise.all([getPlayers(), getTeams()])
      setPlayers(p)
      setTeams(t)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const teamsMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const getTeamName = (id) => teamsMap[id]?.name || 'לא ידוע'
  const getTeamColor = (id) => teamsMap[id]?.primary_color || '#f97316'

  const filteredPlayers = players
    .filter(p => {
      if (search && !`${p.first_name} ${p.last_name}`.includes(search)) return false
      if (teamFilter !== "all" && p.team_id !== teamFilter) return false
      if (positionFilter !== "all" && p.position !== positionFilter) return false
      return true
    })
    .sort((a, b) => {
      if (sortBy === "goals") return (b.goals || 0) - (a.goals || 0)
      if (sortBy === "games") return (b.games_played || 0) - (a.games_played || 0)
      if (sortBy === "name") return a.first_name.localeCompare(b.first_name)
      return 0
    })

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
            <UserCheck className="w-8 h-8 text-orange-600" />
            <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-slate-900 via-orange-800 to-slate-900 dark:from-white dark:via-orange-400 dark:to-white bg-clip-text text-transparent">
              שחקנים
            </h1>
          </div>
          <p className="text-slate-600 dark:text-slate-400 text-lg">כל השחקנים בליגה ({players.length})</p>
        </motion.div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="חיפוש שחקן..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white/60 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 rounded-lg pr-10 pl-3 py-2 text-sm text-slate-900 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>
          <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} className="bg-white/60 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200">
            <option value="all">כל הקבוצות</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select value={positionFilter} onChange={e => setPositionFilter(e.target.value)} className="bg-white/60 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200">
            <option value="all">כל העמדות</option>
            <option value="Field Player">שחקן שדה</option>
            <option value="Goalkeeper">שוער</option>
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="bg-white/60 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200">
            <option value="goals">מיון: שערים</option>
            <option value="games">מיון: משחקים</option>
            <option value="name">מיון: שם</option>
          </select>
        </div>

        {/* Players Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredPlayers.map((player, index) => (
            <motion.div
              key={player.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: Math.min(index * 0.02, 0.5) }}
              className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-4 hover:shadow-md dark:hover:shadow-slate-900/50 transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <TeamLogo team={teamsMap[player.team_id]} size={10} />
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">{player.first_name} {player.last_name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{getTeamName(player.team_id)}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${player.position === 'Goalkeeper' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}`}>
                    {player.position === 'Goalkeeper' ? 'שוער' : 'שדה'}
                  </span>
                  {player.is_core && <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">ליבה</span>}
                  {player.is_referee && <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">שופט</span>}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-slate-50 dark:bg-slate-700/40 rounded-lg p-2">
                  <p className="text-lg font-bold text-green-600 dark:text-green-400">{player.goals || 0}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">שערים</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-700/40 rounded-lg p-2">
                  <p className="text-lg font-bold text-slate-700 dark:text-slate-300">{player.games_played || 0}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">משחקים</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-700/40 rounded-lg p-2">
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{player.blue_cards || 0}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">כחולים</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-700/40 rounded-lg p-2">
                  <p className="text-lg font-bold text-red-600 dark:text-red-400">{player.red_cards || 0}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">אדומים</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {filteredPlayers.length === 0 && (
          <div className="text-center py-12">
            <UserCheck className="w-16 h-16 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
            <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-400">אין שחקנים תואמים</h3>
          </div>
        )}
      </div>
    </div>
  )
}
