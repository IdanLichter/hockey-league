import { useState, useEffect } from "react"
import { getGames, getTeams, getPlayers, getGameStats, getLeagueSetting } from "@/lib/api"
import { Newspaper, RefreshCw } from "lucide-react"
import { motion } from "framer-motion"
import { useSeasonMode } from "@/App"
import { buildFeed } from "@/lib/feed"
import FeedPost from "@/components/feed/FeedPost"
import Composer from "@/components/feed/Composer"
import NavRail from "@/components/feed/NavRail"
import { StandingsWidget, NextGameWidget, LeadersWidget } from "@/components/feed/Widgets"

const SEASON_NAME = "2025-26"
const PAGE_SIZE = 25

export default function Feed() {
  const { seasonMode } = useSeasonMode()
  const [games, setGames] = useState([])
  const [teams, setTeams] = useState([])
  const [players, setPlayers] = useState([])
  const [gameStats, setGameStats] = useState([])
  const [championId, setChampionId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      setLoading(true); setError(null)
      const [g, t, p, s, champ] = await Promise.all([
        getGames(), getTeams(), getPlayers(), getGameStats(), getLeagueSetting('champion_team_id')
      ])
      setGames(g); setTeams(t); setPlayers(p); setGameStats(s); setChampionId(champ)
    } catch (err) { console.error(err); setError("שגיאה בטעינת הנתונים") }
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

  const teamsMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const playersMap = Object.fromEntries(players.map(p => [p.id, p]))

  const feed = buildFeed({
    games, teams, players, gameStats,
    championId, seasonName: SEASON_NAME, seasonMode,
  })

  const visible = feed.slice(0, visibleCount)
  const hasMore = visibleCount < feed.length

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="lg:grid lg:grid-cols-[220px_1fr_320px] lg:gap-6 lg:items-start">
        {/* (1) NavRail — right-most in RTL */}
        <aside className="hidden lg:block lg:sticky lg:top-20 self-start">
          <NavRail />
        </aside>

        {/* (2) Center column — feed */}
        <div className="space-y-4 min-w-0">
          {/* Page header */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="page-title flex items-center gap-2.5">
              <Newspaper className="w-7 h-7 text-orange-500" /> עדכונים
            </h1>
            <p className="page-subtitle mt-1">כל מה שקורה בליגה</p>
          </motion.div>

          <Composer />

          {/* Mobile-only compact widgets */}
          <div className="lg:hidden space-y-4">
            <StandingsWidget teams={teams} />
            <NextGameWidget games={games} teams={teams} />
          </div>

          {/* Feed list */}
          {feed.length === 0 ? (
            <div className="card p-10 text-center">
              <Newspaper className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
              <h3 className="text-lg font-semibold text-slate-500 dark:text-slate-400">אין עדכונים עדיין</h3>
              <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">עדכונים יופיעו כאן ברגע שיהיו תוצאות</p>
            </div>
          ) : (
            <div className="space-y-4">
              {visible.map(post => (
                <FeedPost key={post.id} post={post} playersMap={playersMap} teamsMap={teamsMap} />
              ))}
            </div>
          )}

          {feed.length > 0 && (
            <div className="flex flex-col items-center gap-2 pt-2">
              {hasMore && (
                <button
                  onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700"
                >
                  טען עוד
                </button>
              )}
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                מציג {visible.length} מתוך {feed.length}
              </p>
            </div>
          )}
        </div>

        {/* (3) Widget rail — left-most in RTL */}
        <aside className="hidden lg:block lg:sticky lg:top-20 self-start space-y-4">
          <StandingsWidget teams={teams} />
          <NextGameWidget games={games} teams={teams} />
          <LeadersWidget players={players} teams={teams} />
        </aside>
      </div>
    </div>
  )
}
