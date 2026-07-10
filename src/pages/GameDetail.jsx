import { useState, useEffect } from "react"
import { useParams, Link } from "react-router-dom"
import { getGameById, getGameStatsByGameId, getTeams, getPlayers, getReferees, getGames } from "@/lib/api"
import { ArrowRight, ArrowLeft, Calendar, Clock, MapPin, Shield, Trophy, Users, Flame, Swords, TrendingUp, RefreshCw } from "lucide-react"
import { motion } from "framer-motion"
import { format } from "date-fns"
import TeamLogo from "@/components/TeamLogo"
import { TeamLink, PlayerLink } from "@/components/EntityLinks"
import { useSeo } from "@/lib/seo"

const statusCfg = {
  scheduled: { label: "מתוכנן", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  waiting_result: { label: "ממתין לתוצאה", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  in_progress: { label: "משחק חי", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  completed: { label: "הסתיים", cls: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400" },
  postponed: { label: "נדחה", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
}

const resultCls = (r) =>
  r === 'win' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
  : r === 'loss' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
  : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
const resultLabel = (r) => (r === 'win' ? 'ניצחון' : r === 'loss' ? 'הפסד' : 'תיקו')

// One player's line in a box score — matches Games.jsx pill markup exactly.
function StatPills({ stat }) {
  return (
    <div className="flex gap-1.5 shrink-0">
      {stat.goals > 0 && <span className="stat-pill bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 !py-0 !px-1.5">⚽ {stat.goals}</span>}
      {stat.blue_cards > 0 && <span className="stat-pill bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 !py-0 !px-1.5">🟦 {stat.blue_cards}</span>}
      {stat.red_cards > 0 && <span className="stat-pill bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 !py-0 !px-1.5">🟥 {stat.red_cards}</span>}
    </div>
  )
}

export default function GameDetail() {
  const { id } = useParams()
  const [game, setGame] = useState(null)
  const [stats, setStats] = useState([])
  const [teams, setTeams] = useState([])
  const [players, setPlayers] = useState([])
  const [referees, setReferees] = useState([])
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Computed before the early returns so the hooks below (useSeo) always run.
  const teamsMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const playersMap = Object.fromEntries(players.map(p => [p.id, p]))
  const home = game ? teamsMap[game.home_team_id] : null
  const away = game ? teamsMap[game.away_team_id] : null

  useSeo({
    title: home && away ? `${home.name} נגד ${away.name}` : 'משחק',
    description: home && away
      ? `תוצאה, הרכבים וסטטיסטיקות מהמשחק בין ${home.name} ל${away.name} בליגת הרולר הוקי הישראלית`
      : undefined,
    path: `/games/${id}`,
  })

  useEffect(() => { loadData() }, [id])

  const loadData = async () => {
    try {
      setLoading(true); setError(null)
      const [g, s, t, p, r, allGames] = await Promise.all([
        getGameById(id), getGameStatsByGameId(id), getTeams(), getPlayers(), getReferees(), getGames(),
      ])
      setGame(g); setStats(s || []); setTeams(t); setPlayers(p); setReferees(r); setGames(allGames)
    } catch (err) {
      console.error(err)
      setError(err?.code === 'PGRST116' ? 'notfound' : 'error')
    } finally { setLoading(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-orange-500 border-t-transparent" />
      </div>
    )
  }

  if (error || !game) {
    const notFound = error === 'notfound' || !game
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
        <div className="card p-6 flex flex-col items-center justify-center text-center gap-3 min-h-[300px]">
          <Calendar className="w-12 h-12 text-slate-300 dark:text-slate-600" />
          <h2 className="text-lg font-bold text-slate-700 dark:text-slate-200">{notFound ? 'המשחק לא נמצא' : 'שגיאה בטעינת המשחק'}</h2>
          <p className="text-sm text-slate-400 dark:text-slate-500">{notFound ? 'ייתכן שהמשחק הוסר או שהקישור שגוי' : 'משהו השתבש, נסו שוב'}</p>
          <div className="flex gap-2 mt-1">
            {!notFound && (
              <button onClick={loadData} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-600 text-white rounded-lg text-xs font-semibold hover:bg-slate-700 transition-colors">
                <RefreshCw className="w-3.5 h-3.5" /> נסה שוב
              </button>
            )}
            <Link to="/games" className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-semibold hover:bg-orange-600 transition-colors">
              <ArrowRight className="w-3.5 h-3.5" /> חזרה למשחקים
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ---- Derived match state ----
  // Score is only "real" once a game is completed. Some scheduled rows carry a
  // pre-entered score in the DB, but the whole app (Games list, TeamDetail)
  // gates the score on status === 'completed', so we do the same here.
  const done = game.status === 'completed'
  const played = done && game.home_score != null && game.away_score != null
  const homeWin = played && game.home_score > game.away_score
  const awayWin = played && game.away_score > game.home_score
  const tie = played && game.home_score === game.away_score
  const st = statusCfg[game.status] || statusCfg.completed
  const isPlayoff = game.game_type === 'פלייאוף'

  const refName = (() => {
    if (!game.referee_id) return null
    const pool = game.referee_type === 'player' ? players : referees
    const r = pool.find(x => x.id === game.referee_id)
    return r ? `${r.first_name} ${r.last_name}` : null
  })()

  // ---- Box score / stat derivations ----
  const teamStats = (tid) => stats.filter(s => playersMap[s.player_id]?.team_id === tid)
  const guestStats = stats.filter(s => s.is_guest_player)
  const scorers = [...stats].filter(s => (s.goals || 0) > 0).sort((a, b) => (b.goals || 0) - (a.goals || 0))
  const blueCards = stats.reduce((sum, s) => sum + (s.blue_cards || 0), 0)
  const redCards = stats.reduce((sum, s) => sum + (s.red_cards || 0), 0)

  const tiles = played ? [
    { val: game.home_score + game.away_score, label: "סה״כ שערים", color: "text-orange-500" },
    { val: game.home_score, label: "שערי הבית", color: "text-emerald-600 dark:text-emerald-400" },
    { val: game.away_score, label: "שערי החוץ", color: "text-emerald-600 dark:text-emerald-400" },
    { val: blueCards, label: "כרטיסים כחולים", color: "text-blue-600 dark:text-blue-400" },
    { val: redCards, label: "כרטיסים אדומים", color: "text-red-500 dark:text-red-400" },
  ] : []

  // ---- Head-to-head: other completed meetings between the two teams ----
  const h2h = games
    .filter(g => g.id !== game.id && g.status === 'completed' && g.home_score != null && g.away_score != null &&
      ((g.home_team_id === game.home_team_id && g.away_team_id === game.away_team_id) ||
       (g.home_team_id === game.away_team_id && g.away_team_id === game.home_team_id)))
    .sort((a, b) => new Date(b.game_date) - new Date(a.game_date))

  // ---- Pre-match form: each team's last 5 completed results BEFORE this game ----
  const formBefore = (teamId) => games
    .filter(g => g.status === 'completed' && g.home_score != null && g.away_score != null &&
      new Date(g.game_date) < new Date(game.game_date) &&
      (g.home_team_id === teamId || g.away_team_id === teamId))
    .sort((a, b) => new Date(b.game_date) - new Date(a.game_date))
    .slice(0, 5)
    .map(g => {
      const isHome = g.home_team_id === teamId
      const my = isHome ? g.home_score : g.away_score
      const opp = isHome ? g.away_score : g.home_score
      return my > opp ? 'win' : my < opp ? 'loss' : 'tie'
    })
  const homeForm = formBefore(game.home_team_id)
  const awayForm = formBefore(game.away_team_id)

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-5">
      <Link to="/games" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
        <ArrowRight className="w-4 h-4" /> חזרה למשחקים
      </Link>

      {/* ============ HEADER ============ */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className={`stat-pill ${st.cls}`}>{st.label}</span>
          <span className={`stat-pill ${isPlayoff ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>{game.game_type}</span>
          {isPlayoff && game.series_game && <span className="stat-pill bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">משחק {game.series_game}</span>}
        </div>

        <div className="flex items-center justify-between gap-3">
          {/* Home (right in RTL) */}
          <TeamLink team={home} className="flex flex-col items-center gap-2 flex-1 min-w-0 group">
            <TeamLogo team={home} size={14} />
            <span className={`font-bold text-sm text-center truncate w-full group-hover:text-orange-500 transition-colors ${homeWin ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-900 dark:text-white'}`}>{home?.name || '—'}</span>
            <span className={`text-[11px] font-medium ${homeWin ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>{tie ? 'תיקו' : homeWin ? 'מנצחת' : 'בית'}</span>
          </TeamLink>

          {/* Score / kickoff */}
          <div className="shrink-0 text-center px-1 sm:px-2">
            {played ? (
              /* RTL: the flex row places home on the RIGHT and away on the LEFT, but
                 digits render left-to-right. So away_score prints first (left, beside
                 the away team) and home_score last (right, beside home). Do NOT flip
                 to home:away — see hockey-league-rtl-score-gotcha memory. */
              <div className="text-3xl sm:text-4xl font-extrabold tabular-nums tracking-tight">
                <span className={awayWin ? 'text-emerald-600 dark:text-emerald-400' : homeWin ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}>{game.away_score}</span>
                <span className="text-slate-300 dark:text-slate-600 mx-1.5">:</span>
                <span className={homeWin ? 'text-emerald-600 dark:text-emerald-400' : awayWin ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}>{game.home_score}</span>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <span className="text-2xl font-extrabold text-slate-300 dark:text-slate-600 tabular-nums">{format(new Date(game.game_date), "HH:mm")}</span>
                <span className="text-[11px] text-slate-400 mt-0.5">שעת פתיחה</span>
              </div>
            )}
          </div>

          {/* Away (left in RTL) */}
          <TeamLink team={away} className="flex flex-col items-center gap-2 flex-1 min-w-0 group">
            <TeamLogo team={away} size={14} />
            <span className={`font-bold text-sm text-center truncate w-full group-hover:text-orange-500 transition-colors ${awayWin ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-900 dark:text-white'}`}>{away?.name || '—'}</span>
            <span className={`text-[11px] font-medium ${awayWin ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>{tie ? 'תיקו' : awayWin ? 'מנצחת' : 'חוץ'}</span>
          </TeamLink>
        </div>

        <div className="flex items-center justify-center gap-x-4 gap-y-2 mt-5 pt-5 border-t border-slate-100 dark:border-slate-700/50 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
          <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{format(new Date(game.game_date), "d/M/yyyy")}</span>
          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{format(new Date(game.game_date), "HH:mm")}</span>
          <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{game.venue || '—'}</span>
          {refName && <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5" />{refName}</span>}
        </div>

        {game.notes && (
          <div className="mt-4 p-2.5 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-xs text-amber-700 dark:text-amber-300 border border-amber-100 dark:border-amber-800/50">
            {game.notes}
          </div>
        )}
      </motion.div>

      {/* ============ STAT TILES ============ */}
      {tiles.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3 uppercase tracking-wide">סיכום המשחק</h2>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
            {tiles.map(({ val, label, color }) => (
              <div key={label} className="card p-4 text-center">
                <p className={`text-2xl font-extrabold ${color}`}>{val}</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ============ BOX SCORE ============ */}
      {done && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
            <h2 className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
              <Users className="w-4 h-4 text-orange-500" /> הרכבים וסטטיסטיקות
            </h2>
          </div>
          <div className="p-4 sm:p-5">
            {stats.length === 0 ? (
              <p className="text-center text-sm text-slate-400 dark:text-slate-500 py-6">לא הוזנו סטטיסטיקות למשחק זה</p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
                  {[game.home_team_id, game.away_team_id].map(tid => {
                    const rows = teamStats(tid)
                    return (
                      <div key={tid}>
                        <div className="flex items-center gap-2 mb-2.5">
                          <TeamLogo team={teamsMap[tid]} size={6} />
                          <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 truncate">{teamsMap[tid]?.name || '—'}</h3>
                        </div>
                        <div className="space-y-0.5">
                          {rows.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-500 py-1">אין נתונים</p>}
                          {rows.map(stat => {
                            const p = playersMap[stat.player_id]
                            return (
                              <div key={stat.id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                <PlayerLink playerId={stat.player_id} className="text-sm text-slate-700 dark:text-slate-300 hover:text-orange-500 transition-colors truncate min-w-0">
                                  {p ? `${p.first_name} ${p.last_name}` : '—'}
                                </PlayerLink>
                                <StatPills stat={stat} />
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {guestStats.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-700">
                    <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2.5">אורחים</h3>
                    <div className="space-y-0.5">
                      {guestStats.map(stat => (
                        <div key={stat.id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg">
                          {/* Guests have no player_id → PlayerLink degrades to inert text */}
                          <PlayerLink playerId={stat.player_id} className="text-sm text-slate-700 dark:text-slate-300 truncate min-w-0">
                            {stat.guest_player_name}
                            {stat.guest_player_original_team && <span className="text-slate-400"> ({stat.guest_player_original_team})</span>}
                          </PlayerLink>
                          <StatPills stat={stat} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      )}

      {/* ============ SCORERS ============ */}
      {scorers.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
            <h2 className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
              <Flame className="w-4 h-4 text-orange-500" /> כובשי השערים
            </h2>
          </div>
          <div className="p-3 sm:p-4 space-y-0.5">
            {scorers.map(stat => {
              const p = playersMap[stat.player_id]
              const team = p ? teamsMap[p.team_id] : null
              const name = stat.is_guest_player ? stat.guest_player_name : (p ? `${p.first_name} ${p.last_name}` : '—')
              return (
                <div key={stat.id} className="flex items-center justify-between gap-3 py-2 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {team
                      ? <TeamLogo team={team} size={6} />
                      : <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-[10px] text-slate-400 shrink-0">א</span>}
                    <PlayerLink playerId={stat.player_id} className="font-medium text-sm text-slate-900 dark:text-white truncate hover:text-orange-500 transition-colors">
                      {name}
                    </PlayerLink>
                  </div>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm tabular-nums shrink-0">{stat.goals}⚽</span>
                </div>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* ============ HEAD-TO-HEAD ============ */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }} className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
            <Swords className="w-4 h-4 text-orange-500" /> מפגשים קודמים
          </h2>
          {h2h.length > 0 && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">התוצאות מנקודת מבט {home?.name || 'הבית'}</p>}
        </div>
        <div className="p-4 space-y-2">
          {h2h.length === 0 ? (
            <p className="text-center text-sm text-slate-400 dark:text-slate-500 py-6">אין מפגשים קודמים בין הקבוצות</p>
          ) : h2h.map(g => {
            const wasHome = g.home_team_id === game.home_team_id
            const my = wasHome ? g.home_score : g.away_score
            const opp = wasHome ? g.away_score : g.home_score
            const result = my > opp ? 'win' : my < opp ? 'loss' : 'tie'
            return (
              <Link key={g.id} to={`/games/${g.id}`} className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <div className="flex items-center gap-2 min-w-0 text-xs text-slate-500 dark:text-slate-400">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  <span>{format(new Date(g.game_date), "d/M/yyyy")}</span>
                  <span className="text-slate-400 dark:text-slate-500">· {g.game_type}</span>
                </div>
                {/* dir=ltr isolates the standalone score so RTL can't split away:home
                    and mispair digits (see hockey-league-rtl-score-gotcha). */}
                <span dir="ltr" className={`text-sm font-bold px-2 py-1 rounded-md tabular-nums shrink-0 ${resultCls(result)}`} title={resultLabel(result)}>
                  {g.away_score}:{g.home_score}
                </span>
              </Link>
            )
          })}
        </div>
      </motion.div>

      {/* ============ PRE-MATCH FORM ============ */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }} className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
            <TrendingUp className="w-4 h-4 text-orange-500" /> טופס לפני המשחק
          </h2>
        </div>
        <div className="p-4 space-y-3">
          {[{ team: home, form: homeForm, side: 'בית' }, { team: away, form: awayForm, side: 'חוץ' }].map(({ team, form, side }) => (
            <div key={side} className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <TeamLink team={team} className="flex items-center gap-2.5 min-w-0 group">
                <TeamLogo team={team} size={8} />
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-slate-900 dark:text-white truncate group-hover:text-orange-500 transition-colors">{team?.name || '—'}</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">{side}</p>
                </div>
              </TeamLink>
              {form.length > 0 ? (
                <div className="flex gap-1 shrink-0">
                  {form.map((r, i) => (
                    <span key={i} title={resultLabel(r)}
                      className={`w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold text-white ${r === 'win' ? 'bg-emerald-500' : r === 'loss' ? 'bg-red-500' : 'bg-slate-400 dark:bg-slate-600'}`}>
                      {r === 'win' ? 'נ' : r === 'loss' ? 'ה' : 'ת'}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0">אין משחקים קודמים</span>
              )}
            </div>
          ))}
        </div>
      </motion.div>

      {/* ============ TEAM PAGE LINKS ============ */}
      <div className="grid grid-cols-2 gap-3">
        {[home, away].map((team, i) => (
          <TeamLink key={i} team={team} className="card-hover flex items-center justify-center gap-2 py-3.5 px-3 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:text-orange-600 dark:hover:text-orange-400 transition-colors">
            <TeamLogo team={team} size={6} />
            <span className="truncate">{team?.name || '—'}</span>
            <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
          </TeamLink>
        ))}
      </div>
    </div>
  )
}
