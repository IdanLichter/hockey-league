import { useState, useEffect } from "react"
import { useParams, Link } from "react-router-dom"
import {
  getArchivedSeasons, getArchivedStandings,
  getArchivedPlayerStats, getArchivedGames
} from "@/lib/api"
import { Archive, Trophy, Users, UserCheck, Calendar, ArrowRight, RefreshCw } from "lucide-react"
import { motion } from "framer-motion"
import { format } from "date-fns"
import TeamLogo from "@/components/TeamLogo"

export default function ArchivePage() {
  const { seasonId } = useParams()

  if (seasonId) return <SeasonDetail seasonId={seasonId} />
  return <SeasonsList />
}

function SeasonsList() {
  const [seasons, setSeasons] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadSeasons = () => {
    setLoading(true); setError(null)
    getArchivedSeasons()
      .then(setSeasons)
      .catch((err) => { console.error(err); setError("שגיאה בטעינת הנתונים") })
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadSeasons() }, [])

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
          <button onClick={loadSeasons} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors">
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
          <Archive className="w-7 h-7 text-orange-500" /> ארכיון עונות
        </h1>
        <p className="page-subtitle mt-1">צפייה בנתוני עונות קודמות</p>
      </motion.div>

      {seasons.length === 0 ? (
        <div className="text-center py-16">
          <Archive className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <h3 className="text-lg font-semibold text-slate-500 dark:text-slate-400">אין עונות בארכיון</h3>
          <p className="text-sm text-slate-400 mt-1">עונות שהסתיימו יופיעו כאן</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {seasons.map((season, i) => (
            <motion.div key={season.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Link to={`/archive/${season.id}`} className="card-hover p-5 block">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center shadow-md">
                    <Trophy className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-lg text-slate-900 dark:text-white">עונת {season.name}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">אורכבה {new Date(season.archived_at).toLocaleDateString('he-IL')}</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-slate-400" />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

function SeasonDetail({ seasonId }) {
  const [season, setSeason] = useState(null)
  const [standings, setStandings] = useState([])
  const [playerStats, setPlayerStats] = useState([])
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState("standings")

  const loadSeason = () => {
    setLoading(true); setError(null)
    Promise.all([
      getArchivedSeasons(),
      getArchivedStandings(seasonId),
      getArchivedPlayerStats(seasonId),
      getArchivedGames(seasonId)
    ])
      .then(([seasons, st, ps, gm]) => {
        setSeason(seasons.find(s => s.id === seasonId))
        setStandings(st)
        setPlayerStats(ps)
        setGames(gm)
      })
      .catch((err) => { console.error(err); setError("שגיאה בטעינת הנתונים") })
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadSeason() }, [seasonId])

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
          <button onClick={loadSeason} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> נסה שוב
          </button>
        </div>
      </div>
    )
  }

  const topScorer = playerStats.filter(p => p.position === 'Field Player')[0]

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-5">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Link to="/archive" className="text-xs font-semibold text-orange-500 hover:text-orange-600 mb-2 inline-block">
          ← חזרה לארכיון
        </Link>
        <h1 className="page-title flex items-center gap-2.5">
          <Trophy className="w-7 h-7 text-orange-500" /> עונת {season?.name}
        </h1>
      </motion.div>

      {/* Stats overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4 text-center">
          <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{standings[0]?.team_name || '—'}</p>
          <p className="text-[10px] text-amber-500 font-bold mt-1">אלופה</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{games.length}</p>
          <p className="text-[10px] text-slate-400 font-medium">משחקים</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{standings.length}</p>
          <p className="text-[10px] text-slate-400 font-medium">קבוצות</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
            {topScorer ? `${topScorer.player_first_name} ${topScorer.player_last_name}` : '—'}
          </p>
          <p className="text-[10px] text-slate-400 font-medium">מלך שערים ({topScorer?.goals || 0})</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        {[
          { id: "standings", label: "טבלה", icon: Trophy },
          { id: "players", label: "שחקנים", icon: UserCheck },
          { id: "games", label: "משחקים", icon: Calendar },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={tab === t.id ? "tab-active" : "tab-inactive"}>
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Standings */}
      {tab === "standings" && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-900 dark:bg-slate-800 text-white text-xs">
                <th className="py-3 px-4 text-right font-semibold">#</th>
                <th className="py-3 px-4 text-right font-semibold">קבוצה</th>
                <th className="py-3 px-2 text-center font-semibold">נק׳</th>
                <th className="py-3 px-2 text-center font-semibold">נ</th>
                <th className="py-3 px-2 text-center font-semibold">ת</th>
                <th className="py-3 px-2 text-center font-semibold">ה</th>
                <th className="py-3 px-2 text-center font-semibold">שז</th>
                <th className="py-3 px-2 text-center font-semibold">שח</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {standings.map(team => (
                <tr key={team.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-xs font-bold ${
                      team.final_rank === 1 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' :
                      team.final_rank === 2 ? 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300' :
                      team.final_rank === 3 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400' :
                      'text-slate-400'
                    }`}>
                      {team.final_rank}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">{team.team_name}</td>
                  <td className="py-3 px-2 text-center font-extrabold text-slate-900 dark:text-white">{team.points}</td>
                  <td className="py-3 px-2 text-center text-emerald-600 dark:text-emerald-400 font-semibold">{team.wins}</td>
                  <td className="py-3 px-2 text-center text-slate-500">{team.ties}</td>
                  <td className="py-3 px-2 text-center text-red-500 font-semibold">{team.losses}</td>
                  <td className="py-3 px-2 text-center text-slate-700 dark:text-slate-300">{team.goals_for}</td>
                  <td className="py-3 px-2 text-center text-slate-400">{team.goals_against}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Players */}
      {tab === "players" && (
        <div className="card overflow-hidden">
          <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {playerStats.map((p, i) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-md text-xs font-bold flex items-center justify-center ${
                    i === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' :
                    i === 1 ? 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300' :
                    i === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400' :
                    'text-slate-400'
                  }`}>
                    {i + 1}
                  </span>
                  <div>
                    <span className="font-semibold text-sm text-slate-900 dark:text-white">
                      {p.player_first_name} {p.player_last_name}
                    </span>
                    <p className="text-[11px] text-slate-400">{p.team_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{p.goals} שערים</span>
                  <span className="text-slate-400">{p.games_played} מש׳</span>
                  {p.blue_cards > 0 && <span className="text-blue-500">{p.blue_cards} כחול</span>}
                  {p.red_cards > 0 && <span className="text-red-500">{p.red_cards} אדום</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Games */}
      {tab === "games" && (
        <div className="card overflow-hidden">
          <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {games.map(game => (
              <div key={game.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="font-semibold text-sm text-slate-900 dark:text-white truncate">{game.home_team_name}</span>
                  {/* RTL: away first, home last so each score renders beside its team (home is on the right). */}
                  <div className="text-center px-2">
                    {game.status === 'completed' ? (
                      <span className="font-bold text-sm text-slate-900 dark:text-white tabular-nums">{game.away_score} : {game.home_score}</span>
                    ) : (
                      <span className="text-[10px] text-slate-400">—</span>
                    )}
                  </div>
                  <span className="font-semibold text-sm text-slate-900 dark:text-white truncate">{game.away_team_name}</span>
                </div>
                <div className="flex items-center gap-2 mr-3">
                  <span className="text-[10px] text-slate-400">
                    {game.game_date ? format(new Date(game.game_date), "d/M/yy") : '—'}
                  </span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                    {game.game_type}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
