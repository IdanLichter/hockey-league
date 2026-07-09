import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { getGames, getTeams } from "@/lib/api"
import { Gavel, Calendar, MapPin, RefreshCw, ChevronLeft, Clock } from "lucide-react"
import { motion } from "framer-motion"
import { format } from "date-fns"
import TeamLogo from "@/components/TeamLogo"
import JudgeGate from "@/components/judge/JudgeGate"

const OFFICIABLE = ["scheduled", "in_progress", "waiting_result"]
const statusCfg = {
  scheduled: { label: "מתוכנן", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  in_progress: { label: "משחק חי", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  waiting_result: { label: "ממתין לתוצאה", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
}

function JudgePicker() {
  const [games, setGames] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      setLoading(true); setError(null)
      const [g, t] = await Promise.all([getGames(), getTeams()])
      setGames(g); setTeams(t)
    } catch (e) { console.error(e); setError("שגיאה בטעינת הנתונים") }
    finally { setLoading(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-orange-500 border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
        <div className="card p-6 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 flex flex-col items-center justify-center text-center gap-3 min-h-[300px]">
          <span className="text-red-700 dark:text-red-400 text-sm font-medium">{error}</span>
          <button onClick={loadData} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> נסה שוב
          </button>
        </div>
      </div>
    )
  }

  const teamsMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const officiable = games
    .filter(g => OFFICIABLE.includes(g.status))
    .sort((a, b) => new Date(a.game_date) - new Date(b.game_date))

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-5">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="page-title flex items-center gap-2.5">
          <Gavel className="w-7 h-7 text-orange-500" /> שיפוט משחקים
        </h1>
        <p className="page-subtitle mt-1">בחר/י משחק כדי לנהל תוצאה וסטטיסטיקות בזמן אמת</p>
      </motion.div>

      {officiable.length === 0 ? (
        <div className="card p-10 text-center">
          <Calendar className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">אין משחקים זמינים לשיפוט</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">משחקים מתוכננים או פעילים יופיעו כאן</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {officiable.map((game, i) => {
            const home = teamsMap[game.home_team_id]
            const away = teamsMap[game.away_team_id]
            const st = statusCfg[game.status] || statusCfg.scheduled
            return (
              <motion.div key={game.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}>
                <Link to={`/judge/${game.id}`} className="card-hover p-4 sm:p-5 block">
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`stat-pill ${st.cls}`}>{st.label}</span>
                    {game.game_type && game.game_type !== 'ליגה' && (
                      <span className="stat-pill bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">{game.game_type}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <TeamLogo team={home} size={10} />
                      <span className="font-bold text-sm text-slate-900 dark:text-white truncate">{home?.name || '—'}</span>
                    </div>
                    <span className="text-xs font-bold text-slate-400 dark:text-slate-500 shrink-0">נגד</span>
                    <div className="flex items-center gap-2.5 flex-1 min-w-0 flex-row-reverse">
                      <TeamLogo team={away} size={10} />
                      <span className="font-bold text-sm text-slate-900 dark:text-white truncate text-left">{away?.name || '—'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                    <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{format(new Date(game.game_date), "d/M/yyyy")}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{format(new Date(game.game_date), "HH:mm")}</span>
                    <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{game.venue || '—'}</span>
                    <span className="mr-auto flex items-center gap-1 font-semibold text-orange-600 dark:text-orange-400">
                      פתח לוח שיפוט <ChevronLeft className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </Link>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function Judge() {
  return <JudgeGate><JudgePicker /></JudgeGate>
}
