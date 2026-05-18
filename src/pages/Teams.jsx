import { useState, useEffect } from "react"
import { getTeams, getPlayers } from "@/lib/api"
import { Users, Trophy, Target, Shield, ChevronDown, ChevronUp } from "lucide-react"
import { motion } from "framer-motion"

export default function Teams() {
  const [teams, setTeams] = useState([])
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedTeam, setExpandedTeam] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [t, p] = await Promise.all([getTeams(), getPlayers()])
      setTeams(t)
      setPlayers(p)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

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
            <Users className="w-8 h-8 text-orange-600" />
            <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-slate-900 via-orange-800 to-slate-900 bg-clip-text text-transparent">
              קבוצות
            </h1>
          </div>
          <p className="text-slate-600 text-lg">כל הקבוצות בליגה עונת 2024-25</p>
        </motion.div>

        <div className="grid gap-4">
          {teams.sort((a, b) => (b.points || 0) - (a.points || 0)).map((team, index) => {
            const teamPlayers = players.filter(p => p.team_id === team.id)
            const isExpanded = expandedTeam === team.id
            const topScorer = teamPlayers.filter(p => p.position === 'Field Player').sort((a, b) => (b.goals || 0) - (a.goals || 0))[0]

            return (
              <motion.div
                key={team.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <div className="bg-white/60 backdrop-blur-sm border border-slate-200/60 rounded-xl overflow-hidden">
                  <button onClick={() => setExpandedTeam(isExpanded ? null : team.id)} className="w-full p-4 sm:p-6 text-right">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-lg"
                          style={{ backgroundColor: team.primary_color || '#f97316' }}>
                          {team.name.charAt(0)}
                        </div>
                        <div className="text-right">
                          <h3 className="font-bold text-lg text-slate-900">{team.name}</h3>
                          <p className="text-sm text-slate-500">{team.city} • נוסדה {team.founded_year}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="hidden sm:flex gap-6 text-center">
                          <div><p className="text-2xl font-bold">{team.points || 0}</p><p className="text-xs text-slate-500">נקודות</p></div>
                          <div><p className="text-lg font-semibold text-green-600">{team.wins || 0}</p><p className="text-xs text-slate-500">נ</p></div>
                          <div><p className="text-lg font-semibold text-red-600">{team.losses || 0}</p><p className="text-xs text-slate-500">ה</p></div>
                        </div>
                        {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                      </div>
                    </div>
                    <div className="sm:hidden flex gap-3 mt-3">
                      <span className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full font-bold">{team.points} נק׳</span>
                      <span className="text-xs text-slate-500">{team.wins}נ {team.ties}ת {team.losses}ה</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 sm:px-6 pb-6 border-t border-slate-100">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 mb-6">
                        <div className="bg-slate-50 rounded-lg p-3 text-center">
                          <Trophy className="w-5 h-5 text-orange-500 mx-auto mb-1" />
                          <p className="text-xl font-bold">{team.points || 0}</p><p className="text-xs text-slate-500">נקודות</p>
                        </div>
                        <div className="bg-green-50 rounded-lg p-3 text-center">
                          <Target className="w-5 h-5 text-green-500 mx-auto mb-1" />
                          <p className="text-xl font-bold text-green-700">{team.goals_for || 0}</p><p className="text-xs text-slate-500">זכות</p>
                        </div>
                        <div className="bg-red-50 rounded-lg p-3 text-center">
                          <Shield className="w-5 h-5 text-red-500 mx-auto mb-1" />
                          <p className="text-xl font-bold text-red-700">{team.goals_against || 0}</p><p className="text-xs text-slate-500">חובה</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-3 text-center">
                          <Users className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                          <p className="text-xl font-bold text-blue-700">{teamPlayers.length}</p><p className="text-xs text-slate-500">שחקנים</p>
                        </div>
                      </div>

                      {topScorer && (
                        <div className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                          <p className="text-xs text-amber-700 font-medium">מלך השערים</p>
                          <p className="font-bold text-amber-900">{topScorer.first_name} {topScorer.last_name} - {topScorer.goals} שערים</p>
                        </div>
                      )}

                      <h4 className="font-semibold text-slate-900 mb-3">סגל ({teamPlayers.length})</h4>
                      <div className="grid gap-2">
                        {teamPlayers.sort((a, b) => (b.goals || 0) - (a.goals || 0)).map(player => (
                          <div key={player.id} className="flex items-center justify-between p-2 bg-slate-50/60 rounded-lg text-sm">
                            <div className="flex items-center gap-2">
                              {player.is_core && <span className="w-2 h-2 rounded-full bg-orange-500" />}
                              <span className="font-medium">{player.first_name} {player.last_name}</span>
                              {player.jersey_number && <span className="text-xs text-slate-400">#{player.jersey_number}</span>}
                              <span className={`text-xs px-1.5 py-0.5 rounded ${player.position === 'Goalkeeper' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                                {player.position === 'Goalkeeper' ? 'שוער' : 'שדה'}
                              </span>
                              {player.is_referee && <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">שופט</span>}
                            </div>
                            <div className="flex gap-2 text-xs">
                              {(player.goals || 0) > 0 && <span className="text-green-700 font-medium">{player.goals} שערים</span>}
                              <span className="text-slate-400">{player.games_played || 0} מש׳</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
