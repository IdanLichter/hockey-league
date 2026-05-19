import { useState, useEffect } from "react"
import { getTeams, getGames } from "@/lib/api"
import { Trophy, Crown, Swords, Calendar, ArrowLeft } from "lucide-react"
import { motion } from "framer-motion"
import { format } from "date-fns"
import TeamLogo from "@/components/TeamLogo"

export default function FinalFour() {
  const [teams, setTeams] = useState([])
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      const [t, g] = await Promise.all([getTeams(), getGames()])
      setTeams(t); setGames(g)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const teamsMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const teamName = (id) => teamsMap[id]?.name || '—'
  const sorted = [...teams].sort((a, b) => (b.points || 0) - (a.points || 0))
  const first = sorted[0]

  const playoffGames = games.filter(g => g.game_type === 'פלייאוף')

  const series = sorted.length >= 7 ? [
    { name: "A", t1: sorted[1], t2: sorted[6], p1: 2, p2: 7 },
    { name: "B", t1: sorted[2], t2: sorted[5], p1: 3, p2: 6 },
    { name: "C", t1: sorted[3], t2: sorted[4], p1: 4, p2: 5 },
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
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="page-title flex items-center gap-2.5">
          <Trophy className="w-7 h-7 text-orange-500" /> Final Four
        </h1>
        <p className="page-subtitle mt-1">שלב הגמר — עונת 2024-25</p>
      </motion.div>

      {/* Bracket */}
      <div className="card p-5 sm:p-6">
        <h2 className="font-bold text-sm text-slate-900 dark:text-white mb-5 flex items-center gap-2 uppercase tracking-wide">
          <Swords className="w-4 h-4 text-orange-500" /> מבנה הטורניר
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr_auto_1fr] gap-4 lg:gap-2 items-start">
          {/* Playoff Round */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 text-center uppercase tracking-wider mb-2">פלייאוף</h3>
            {series.map((s, i) => {
              const sGames = playoffGames.filter(g =>
                (g.home_team_id === s.t1?.id && g.away_team_id === s.t2?.id) ||
                (g.home_team_id === s.t2?.id && g.away_team_id === s.t1?.id)
              )
              return (
                <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                  className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3.5 border border-slate-100 dark:border-slate-700">
                  <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-md">סדרה {s.name}</span>
                  <div className="mt-2.5 space-y-1.5">
                    {[{ team: s.t1, pos: s.p1 }, { team: s.t2, pos: s.p2 }].map(({ team, pos }) => (
                      <div key={pos} className="flex items-center gap-2 p-2 bg-white dark:bg-slate-800 rounded-lg">
                        <TeamLogo team={team} size={6} />
                        <span className="font-semibold text-xs text-slate-900 dark:text-white flex-1 truncate">{team?.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">#{pos}</span>
                      </div>
                    ))}
                  </div>
                  {sGames.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {sGames.map(g => (
                        <div key={g.id} className="flex items-center justify-between text-[11px] px-2 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                          <span className="text-slate-600 dark:text-slate-400">מ׳ {g.series_game}</span>
                          <span className="text-slate-500 dark:text-slate-400">{format(new Date(g.game_date), "d/M")}</span>
                          {g.status === 'completed'
                            ? <span className="font-bold text-slate-900 dark:text-white tabular-nums">{g.home_score} - {g.away_score}</span>
                            : <span className="text-blue-600 dark:text-blue-400 font-medium">מתוכנן</span>
                          }
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )
            })}
          </div>

          {/* Arrow */}
          <div className="hidden lg:flex items-center justify-center pt-16">
            <ArrowLeft className="w-5 h-5 text-slate-300 dark:text-slate-600" />
          </div>

          {/* Semi Finals */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 text-center uppercase tracking-wider mb-2">חצי גמר</h3>

            {first && (
              <div className="bg-gradient-to-l from-amber-50 to-white dark:from-amber-950/30 dark:to-slate-800 rounded-xl p-3.5 border-2 border-amber-200 dark:border-amber-700">
                <div className="flex items-center gap-1.5 mb-2">
                  <Crown className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">מקום 1 — ישיר</span>
                </div>
                <div className="flex items-center gap-2">
                  <TeamLogo team={first} size={8} />
                  <span className="font-bold text-sm text-slate-900 dark:text-white">{first.name}</span>
                </div>
              </div>
            )}

            <div className="border border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-4 text-center">
              <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">ממתין למנצח</p>
            </div>
            <div className="border border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-4 text-center">
              <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">ממתין למנצח</p>
            </div>
          </div>

          {/* Arrow */}
          <div className="hidden lg:flex items-center justify-center pt-16">
            <ArrowLeft className="w-5 h-5 text-slate-300 dark:text-slate-600" />
          </div>

          {/* Final */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 text-center uppercase tracking-wider mb-2">גמר</h3>
            <div className="border border-dashed border-orange-200 dark:border-orange-800 rounded-xl p-8 text-center bg-gradient-to-br from-orange-50/60 to-white dark:from-orange-950/20 dark:to-slate-800">
              <Trophy className="w-10 h-10 text-orange-300 dark:text-orange-700 mx-auto mb-2" />
              <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">טרם נקבע</p>
            </div>
          </div>
        </div>
      </div>

      {/* Playoff Schedule */}
      {playoffGames.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
            <h2 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-500" /> לוח משחקי פלייאוף
            </h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {playoffGames.sort((a, b) => new Date(a.game_date) - new Date(b.game_date)).map(game => (
              <div key={game.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="flex items-center gap-3">
                  <TeamLogo team={teamsMap[game.home_team_id]} size={8} />
                  <span className="font-semibold text-sm text-slate-900 dark:text-white">{teamName(game.home_team_id)}</span>
                  <span className="text-xs text-slate-400 font-medium">vs</span>
                  <span className="font-semibold text-sm text-slate-900 dark:text-white">{teamName(game.away_team_id)}</span>
                  <TeamLogo team={teamsMap[game.away_team_id]} size={8} />
                </div>
                <div className="text-left text-sm">
                  <p className="font-semibold text-slate-900 dark:text-white tabular-nums">{format(new Date(game.game_date), "d/M/yy")}</p>
                  <p className="text-xs text-slate-400">
                    {game.status === 'completed' ? <span className="font-bold">{game.home_score} - {game.away_score}</span> : 'מתוכנן'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
