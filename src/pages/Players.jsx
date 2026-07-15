import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { getPlayers, getTeams } from "@/lib/api"
import { getPlayerTeams, buildMemberMaps } from "@/lib/playerTeams"
import { UserCheck, Search, RefreshCw } from "lucide-react"
import { Player as PlayerIcon } from "@/components/icons/HockeyIcons"
import { motion } from "framer-motion"
import TeamLogo from "@/components/TeamLogo"

export default function Players() {
  const [players, setPlayers] = useState([])
  const [teams, setTeams] = useState([])
  const [playerTeams, setPlayerTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState("")
  const [teamFilter, setTeamFilter] = useState("all")
  const [positionFilter, setPositionFilter] = useState("all")
  const [sortBy, setSortBy] = useState("goals")

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      setLoading(true); setError(null)
      const [p, t, pt] = await Promise.all([getPlayers(), getTeams(), getPlayerTeams().catch(() => [])])
      setPlayers(p); setTeams(t); setPlayerTeams(pt)
    } catch (err) { console.error(err); setError("שגיאה בטעינת הנתונים") }
    finally { setLoading(false) }
  }

  const teamsMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const teamName = (id) => teamsMap[id]?.name || '—'
  const { byTeam: membersByTeam } = buildMemberMaps(playerTeams, players)

  const filtered = players
    .filter(p => {
      if (search && !`${p.first_name} ${p.last_name}`.includes(search)) return false
      if (teamFilter !== "all" && !membersByTeam.get(teamFilter)?.has(p.id)) return false
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
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-orange-500 border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="card p-6 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 flex flex-col items-center justify-center text-center gap-3 min-h-[300px]">
          <span className="text-red-700 dark:text-red-400 text-sm font-medium">{error}</span>
          <button onClick={loadData} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> נסה שוב
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-5">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="page-title flex items-center gap-2.5">
          <PlayerIcon className="w-7 h-7 text-orange-500" /> שחקנים
        </h1>
        <p className="page-subtitle mt-1">{players.length} שחקנים בליגה</p>
      </motion.div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="חיפוש שחקן..." value={search} onChange={e => setSearch(e.target.value)}
            className="filter-input w-full pr-10" />
        </div>
        <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} className="filter-select">
          <option value="all">כל הקבוצות</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={positionFilter} onChange={e => setPositionFilter(e.target.value)} className="filter-select">
          <option value="all">כל העמדות</option>
          <option value="Field Player">שחקן שדה</option>
          <option value="Goalkeeper">שוער</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="filter-select">
          <option value="goals">שערים</option>
          <option value="games">משחקים</option>
          <option value="name">שם</option>
        </select>
      </div>

      {/* Players Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((player, index) => (
          <Link key={player.id} to={`/players/${player.id}`} className="block">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index * 0.02, 0.4) }}
            className="card-hover p-4 h-full"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <TeamLogo team={teamsMap[player.team_id]} size={10} />
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">{player.first_name} {player.last_name}</h3>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">{teamName(player.team_id)}</p>
                </div>
              </div>
              <div className="flex gap-1">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${player.position === 'Goalkeeper' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                  {player.position === 'Goalkeeper' ? 'GK' : 'FP'}
                </span>
                {player.is_core && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">C</span>}
                {player.is_referee && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">R</span>}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {[
                { val: player.goals || 0, label: "שערים", color: "text-emerald-600 dark:text-emerald-400" },
                { val: player.games_played || 0, label: "משחקים", color: "text-slate-700 dark:text-slate-300" },
                { val: player.blue_cards || 0, label: "כחולים", color: "text-blue-600 dark:text-blue-400" },
                { val: player.red_cards || 0, label: "אדומים", color: "text-red-500 dark:text-red-400" },
              ].map(({ val, label, color }) => (
                <div key={label} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg py-2 text-center">
                  <p className={`text-base font-extrabold ${color}`}>{val}</p>
                  <p className="text-[9px] text-slate-400 dark:text-slate-500 font-medium">{label}</p>
                </div>
              ))}
            </div>
          </motion.div>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <UserCheck className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <h3 className="text-lg font-semibold text-slate-500 dark:text-slate-400">אין שחקנים תואמים</h3>
        </div>
      )}
    </div>
  )
}
