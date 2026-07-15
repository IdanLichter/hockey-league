import { useState, useEffect } from "react"
import { useParams, Link } from "react-router-dom"
import { getTeams, getPlayers, getGames } from "@/lib/api"
import { getPlayerTeams, buildMemberMaps } from "@/lib/playerTeams"
import { useAuth } from "@/lib/AuthContext"
import { requestTeamJoin } from "@/lib/teamMembership"
import { standingsComparator } from "@/lib/utils"
import { ageOf, DEFAULT_AGE, AGE_LABEL } from "@/lib/ageGroups"
import { FRIENDLY_GAME_TYPE } from "@/lib/leagueStats"
import { ArrowRight, Users, Trophy, Target, Shield, Calendar, RefreshCw } from "lucide-react"
import { motion } from "framer-motion"
import { format } from "date-fns"
import TeamLogo from "@/components/TeamLogo"
import { useSeo } from "@/lib/seo"

export default function TeamDetail() {
  const { id } = useParams()
  const { profile } = useAuth()
  const [joinState, setJoinState] = useState(null)
  const [teams, setTeams] = useState([])
  const [players, setPlayers] = useState([])
  const [games, setGames] = useState([])
  const [playerTeams, setPlayerTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const teamName = teams.find(t => t.id === id)?.name
  useSeo({
    title: teamName || 'קבוצה',
    description: teamName ? `סגל, תוצאות וסטטיסטיקות של ${teamName} בליגת הרולר הוקי הישראלית` : undefined,
    path: `/teams/${id}`,
  })

  useEffect(() => { loadData() }, [id])

  const loadData = async () => {
    try {
      setLoading(true); setError(null)
      const [t, p, g, pt] = await Promise.all([getTeams(), getPlayers(), getGames(), getPlayerTeams().catch(() => [])])
      if (!t.find(tm => tm.id === id)) { setError("הקבוצה לא נמצאה"); return }
      setTeams(t); setPlayers(p); setGames(g); setPlayerTeams(pt)
    } catch (err) { console.error(err); setError("שגיאה בטעינת הנתונים") }
    finally { setLoading(false) }
  }

  const doJoin = async () => {
    setJoinState('sending')
    try { await requestTeamJoin(id); setJoinState('sent') }
    catch (e) { setJoinState(e?.message === 'join-already-pending' ? 'pending' : 'error') }
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
          <div className="flex gap-2">
            <button onClick={loadData} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" /> נסה שוב
            </button>
            <Link to="/teams" className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-600 text-white rounded-lg text-xs font-semibold hover:bg-slate-700 transition-colors">
              <ArrowRight className="w-3.5 h-3.5" /> חזרה לקבוצות
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const team = teams.find(t => t.id === id)
  const teamsMap = Object.fromEntries(teams.map(t => [t.id, t]))
  // League rank is senior only; a youth-tournament team isn't in the league
  // table, so it shows its age-group badge instead of a bogus rank.
  const isSeniorTeam = ageOf(team) === DEFAULT_AGE
  const rank = isSeniorTeam
    ? [...teams].filter(t => ageOf(t) === DEFAULT_AGE).sort(standingsComparator).findIndex(t => t.id === id) + 1
    : null
  const { byTeam: membersByTeam } = buildMemberMaps(playerTeams, players)
  const roster = players.filter(p => membersByTeam.get(id)?.has(p.id)).sort((a, b) => (b.goals || 0) - (a.goals || 0))
  const isLinkedPlayer = !!profile?.player_id
  const onThisTeam = isLinkedPlayer && roster.some(p => p.id === profile.player_id)
  const gd = (team.goals_for || 0) - (team.goals_against || 0)

  const tiles = [
    { icon: Trophy, val: team.points || 0, label: "נקודות", color: "text-orange-500" },
    { icon: Target, val: team.goals_for || 0, label: "שערי זכות", color: "text-emerald-500" },
    { icon: Shield, val: team.goals_against || 0, label: "שערי חובה", color: "text-red-500" },
    { icon: Users, val: `${gd > 0 ? '+' : ''}${gd}`, label: "הפרש שערים", color: gd >= 0 ? "text-emerald-500" : "text-red-500" },
  ]

  const results = games
    .filter(g => g.status === 'completed' && (g.home_team_id === id || g.away_team_id === id) && g.home_score != null)
    .sort((a, b) => new Date(b.game_date) - new Date(a.game_date))

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-5">
      <Link to="/teams" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
        <ArrowRight className="w-4 h-4" /> חזרה לקבוצות
      </Link>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <TeamLogo team={team} size={14} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="page-title truncate">{team.name}</h1>
              {isSeniorTeam
                ? <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-md">#{rank} בטבלה</span>
                : <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30 px-2 py-0.5 rounded-md">{AGE_LABEL[ageOf(team)]}</span>}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {team.city}{team.founded_year ? ` • נוסדה ${team.founded_year}` : ''}
            </p>
            <div className="flex items-center gap-4 mt-2.5 text-sm">
              <span><span className="font-bold text-emerald-600 dark:text-emerald-400">{team.wins || 0}</span> <span className="text-[11px] text-slate-400">נצחונות</span></span>
              <span><span className="font-bold text-slate-500 dark:text-slate-400">{team.ties || 0}</span> <span className="text-[11px] text-slate-400">תיקו</span></span>
              <span><span className="font-bold text-red-500">{team.losses || 0}</span> <span className="text-[11px] text-slate-400">הפסדים</span></span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Season tiles */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3 uppercase tracking-wide">סיכום עונה</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {tiles.map(({ icon: Icon, val, label, color }) => (
            <div key={label} className="card p-4 text-center">
              <Icon className={`w-4 h-4 ${color} mx-auto mb-1`} />
              <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{val}</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Roster */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
            <Users className="w-4 h-4 text-orange-500" /> סגל
          </h2>
          <div className="flex items-center gap-3 shrink-0">
            {isLinkedPlayer && !onThisTeam && (
              joinState === 'sent'
                ? <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">הבקשה נשלחה ✓</span>
                : joinState === 'pending'
                  ? <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">בקשה ממתינה</span>
                  : <button onClick={doJoin} disabled={joinState === 'sending'}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50">
                      {joinState === 'sending' ? 'שולח…' : 'בקש להצטרף'}
                    </button>
            )}
            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">{roster.length} שחקנים</span>
          </div>
        </div>
        <div className="p-3 sm:p-4 space-y-1">
          {roster.length === 0 && <p className="text-center text-slate-400 dark:text-slate-500 py-8 text-sm">אין שחקנים</p>}
          {roster.map(player => (
            <Link key={player.id} to={`/players/${player.id}`}
              className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-sm">
              <div className="flex items-center gap-2 min-w-0">
                {player.is_core && <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />}
                <span className="font-medium text-slate-900 dark:text-white truncate">{player.first_name} {player.last_name}</span>
                {player.jersey_number != null && <span className="text-[10px] text-slate-400 font-mono shrink-0">#{player.jersey_number}</span>}
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${player.position === 'Goalkeeper' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                  {player.position === 'Goalkeeper' ? 'GK' : 'FP'}
                </span>
                {player.is_referee && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">REF</span>}
              </div>
              <div className="flex items-center gap-3 text-xs shrink-0">
                {(player.goals || 0) > 0 && <span className="font-bold text-emerald-600 dark:text-emerald-400">{player.goals}⚽</span>}
                <span className="text-slate-400">{player.games_played || 0} מש׳</span>
              </div>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* Recent results */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
            <Calendar className="w-4 h-4 text-orange-500" /> תוצאות אחרונות
          </h2>
        </div>
        <div className="p-4 space-y-2">
          {results.length === 0 && <p className="text-center text-slate-400 dark:text-slate-500 py-8 text-sm">אין תוצאות</p>}
          {results.map(game => {
            const isHome = game.home_team_id === id
            const opp = teamsMap[isHome ? game.away_team_id : game.home_team_id]
            const myScore = isHome ? game.home_score : game.away_score
            const oppScore = isHome ? game.away_score : game.home_score
            const result = myScore > oppScore ? 'win' : myScore < oppScore ? 'loss' : 'tie'
            const resultCls =
              result === 'win' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
              : result === 'loss' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
            return (
              <div key={game.id} className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <Link to={`/teams/${opp?.id}`} className="flex items-center gap-2.5 min-w-0 group">
                  <TeamLogo team={opp} size={8} />
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-slate-900 dark:text-white truncate group-hover:text-orange-500 transition-colors">{opp?.name || '—'}</p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      {format(new Date(game.game_date), "d/M/yyyy")} · {isHome ? 'בית' : 'חוץ'}
                      {game.game_type === FRIENDLY_GAME_TYPE && (
                        <span className="text-violet-500 dark:text-violet-400 font-medium"> · ידידותי</span>
                      )}
                    </p>
                  </div>
                </Link>
                {/* RTL score: away_score first, home_score last so each score lands
                    beside its team (see hockey-league-rtl-score-gotcha memory). */}
                <span className={`text-sm font-bold px-2 py-1 rounded-md tabular-nums shrink-0 ${resultCls}`} title={result === 'win' ? 'ניצחון' : result === 'loss' ? 'הפסד' : 'תיקו'}>
                  {game.away_score}:{game.home_score}
                </span>
              </div>
            )
          })}
        </div>
      </motion.div>
    </div>
  )
}
