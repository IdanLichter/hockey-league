import { useState, useEffect } from "react"
import { useParams, Link } from "react-router-dom"
import { getPlayers, getTeams, getGames, getGameStats } from "@/lib/api"
import { useAuth } from "@/lib/AuthContext"
import { getClaimContext, createClaim, cancelClaim } from "@/lib/claims"
import { ArrowRight, Shirt, Shield, Calendar, RefreshCw, UserPlus, Check, Clock } from "lucide-react"
import { motion } from "framer-motion"
import { format } from "date-fns"
import TeamLogo from "@/components/TeamLogo"

export default function PlayerDetail() {
  const { id } = useParams()
  const [player, setPlayer] = useState(null)
  const [teams, setTeams] = useState([])
  const [games, setGames] = useState([])
  const [gameStats, setGameStats] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [photoError, setPhotoError] = useState(false)
  const [logFilter, setLogFilter] = useState("all")
  const { user, loading: authLoading, openAuth } = useAuth()
  const [claimCtx, setClaimCtx] = useState(null)
  const [claimBusy, setClaimBusy] = useState(false)
  const [claimErr, setClaimErr] = useState(null)

  useEffect(() => { loadData() }, [id])

  // Load claim state for this player once it (and the auth user) are known.
  useEffect(() => {
    let alive = true
    setClaimCtx(null); setClaimErr(null)
    if (!player) return
    getClaimContext(player.id).then(c => alive && setClaimCtx(c)).catch(() => alive && setClaimCtx(null))
    return () => { alive = false }
  }, [player?.id, user])

  const loadData = async () => {
    try {
      setLoading(true); setError(null)
      const [players, t, g, gs] = await Promise.all([getPlayers(), getTeams(), getGames(), getGameStats()])
      const p = players.find(pl => pl.id === id)
      if (!p) { setError("השחקן לא נמצא"); return }
      setPlayer(p); setTeams(t); setGames(g); setGameStats(gs)
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
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
        <div className="card p-6 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 flex flex-col items-center justify-center text-center gap-3 min-h-[300px]">
          <span className="text-red-700 dark:text-red-400 text-sm font-medium">{error}</span>
          <div className="flex gap-2">
            <button onClick={loadData} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" /> נסה שוב
            </button>
            <Link to="/players" className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-600 text-white rounded-lg text-xs font-semibold hover:bg-slate-700 transition-colors">
              <ArrowRight className="w-3.5 h-3.5" /> חזרה לשחקנים
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const teamsMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const gamesMap = Object.fromEntries(games.map(g => [g.id, g]))
  const team = teamsMap[player.team_id]
  const isGK = player.position === 'Goalkeeper'
  const positionLabel = isGK ? 'שוער' : 'שחקן שדה'

  // Goalkeeper clean sheets — computed exactly like Statistics.jsx: every
  // COMPLETED game the player's team played where the opponent was held to 0.
  const done = games.filter(g => g.status === 'completed')
  const teamGames = isGK ? done.filter(g => g.home_team_id === player.team_id || g.away_team_id === player.team_id) : []
  const cleanSheets = teamGames.filter(g => (g.home_team_id === player.team_id ? g.away_score : g.home_score) === 0).length

  // Season totals — AUTHORITATIVE from the players row (never recomputed from
  // game_stats; see hockey-league-stats-backfill memory).
  const tiles = [
    { val: player.goals || 0, label: "שערים", color: "text-emerald-600 dark:text-emerald-400" },
    { val: player.games_played || 0, label: "משחקים", color: "text-slate-700 dark:text-slate-300" },
    { val: player.blue_cards || 0, label: "כחולים", color: "text-blue-600 dark:text-blue-400" },
    { val: player.red_cards || 0, label: "אדומים", color: "text-red-500 dark:text-red-400" },
  ]
  if (isGK) tiles.splice(1, 0, { val: cleanSheets, label: "נקיים", color: "text-blue-500 dark:text-blue-400" })

  // Per-game log built from recorded box scores (game_stats) joined to games.
  // May be shorter than games_played for players whose historical box scores
  // are incomplete — that's expected (see backfill memory).
  const gameLog = gameStats
    .filter(s => s.player_id === player.id)
    .map(s => ({ stat: s, game: gamesMap[s.game_id] }))
    .filter(x => x.game)
    .sort((a, b) => new Date(b.game.game_date) - new Date(a.game.game_date))

  // Result (from the player's team perspective) for a given game.
  const resultOf = (game) => {
    const isHome = game.home_team_id === player.team_id
    const my = isHome ? game.home_score : game.away_score
    const opp = isHome ? game.away_score : game.home_score
    return my > opp ? 'win' : my < opp ? 'loss' : 'tie'
  }

  // Last-5 form (most recent first), across all competitions.
  const form = gameLog.slice(0, 5).map(x => resultOf(x.game))

  // Competition filter for the log.
  const comps = [
    { id: "all", label: "הכל" },
    { id: "ליגה", label: "ליגה" },
    { id: "פלייאוף", label: "פלייאוף" },
  ].filter(c => c.id === "all" || gameLog.some(x => x.game.game_type === c.id))
  const filteredLog = logFilter === "all" ? gameLog : gameLog.filter(x => x.game.game_type === logFilter)

  // ----- claim-your-player state -----
  const refreshClaim = () => getClaimContext(player.id).then(setClaimCtx).catch(() => {})
  const handleClaim = async () => {
    setClaimBusy(true); setClaimErr(null)
    try { await createClaim(player.id); await refreshClaim() }
    catch (e) { setClaimErr(e.message === 'not-authenticated' ? 'יש להתחבר תחילה' : 'שגיאה בשליחת הבקשה') }
    finally { setClaimBusy(false) }
  }
  const handleCancelClaim = async () => {
    if (!claimCtx?.pendingClaim) return
    setClaimBusy(true); setClaimErr(null)
    try { await cancelClaim(claimCtx.pendingClaim.id); await refreshClaim() }
    catch { setClaimErr('שגיאה בביטול הבקשה') }
    finally { setClaimBusy(false) }
  }
  const owned = claimCtx && claimCtx.profile?.player_id === player.id
  const pendingHere = claimCtx?.pendingClaim && claimCtx.pendingClaim.player_id === player.id
  const pendingElsewhere = claimCtx?.pendingClaim && claimCtx.pendingClaim.player_id !== player.id
  const takenByOther = claimCtx && claimCtx.playerOwnerId && claimCtx.playerOwnerId !== claimCtx.userId
  const linkedElsewhere = claimCtx && claimCtx.profile?.player_id && claimCtx.profile.player_id !== player.id
  const canClaim = claimCtx && !owned && !takenByOther && !pendingHere && !pendingElsewhere && !linkedElsewhere

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-5">
      <Link to="/players" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
        <ArrowRight className="w-4 h-4" /> חזרה לשחקנים
      </Link>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card p-5 sm:p-6">
        <div className="flex items-center gap-4">
          {player.photo_url && !photoError ? (
            <img src={player.photo_url} alt={`${player.first_name} ${player.last_name}`}
              onError={() => setPhotoError(true)}
              className="w-20 h-20 rounded-2xl object-cover shrink-0 bg-slate-100 dark:bg-slate-700" />
          ) : (
            <div className="w-20 h-20 rounded-2xl shrink-0 flex items-center justify-center text-white text-2xl font-extrabold"
              style={{ backgroundColor: team?.primary_color || '#f97316' }}>
              {player.first_name?.charAt(0) || '?'}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="page-title truncate">{player.first_name} {player.last_name}</h1>
            <Link to={team ? `/teams/${team.id}` : '/teams'} className="flex items-center gap-2 mt-1.5 group w-fit">
              <TeamLogo team={team} size={6} />
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400 group-hover:text-orange-500 transition-colors">{team?.name || '—'}</span>
            </Link>
            <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
              <span className={`stat-pill ${isGK ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                <Shield className="w-3.5 h-3.5" /> {positionLabel}
              </span>
              {player.age != null && (
                <span className="stat-pill bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">גיל {player.age}</span>
              )}
              {player.jersey_number != null && (
                <span className="stat-pill bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  <Shirt className="w-3.5 h-3.5" /> {player.jersey_number}
                </span>
              )}
              {player.is_core && <span className="stat-pill bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">ליבה</span>}
              {player.is_referee && <span className="stat-pill bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">שופט</span>}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Claim-your-player */}
      {!authLoading && (owned || pendingHere || takenByOther || pendingElsewhere || linkedElsewhere || canClaim || !user) && (
        <div className="card p-3.5 flex items-center justify-between gap-3">
          {owned ? (
            <span className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              <Check className="w-4 h-4" /> זה הפרופיל שלך
            </span>
          ) : pendingHere ? (
            <>
              <span className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                <Clock className="w-4 h-4" /> בקשת הבעלות נשלחה — ממתינה לאישור מנהל
              </span>
              <button onClick={handleCancelClaim} disabled={claimBusy}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 shrink-0">
                ביטול
              </button>
            </>
          ) : takenByOther ? (
            <span className="text-sm text-slate-400 dark:text-slate-500">פרופיל זה כבר משויך לחשבון קיים</span>
          ) : pendingElsewhere ? (
            <span className="text-sm text-slate-400 dark:text-slate-500">כבר הגשת בקשת בעלות על שחקן אחר</span>
          ) : linkedElsewhere ? (
            <span className="text-sm text-slate-400 dark:text-slate-500">החשבון שלך כבר משויך לשחקן אחר</span>
          ) : !user ? (
            <>
              <span className="text-sm text-slate-600 dark:text-slate-300">שיחקת בליגה? דרוש/י בעלות על הפרופיל</span>
              <button onClick={openAuth}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors shrink-0">
                <UserPlus className="w-3.5 h-3.5" /> התחברות
              </button>
            </>
          ) : ( /* canClaim */
            <>
              <span className="text-sm text-slate-600 dark:text-slate-300">זה אתה?</span>
              <button onClick={handleClaim} disabled={claimBusy}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50 shrink-0">
                <UserPlus className="w-3.5 h-3.5" /> {claimBusy ? 'שולח...' : 'בקש בעלות על הפרופיל'}
              </button>
            </>
          )}
        </div>
      )}
      {claimErr && <p className="text-xs text-red-500 -mt-3">{claimErr}</p>}

      {/* Season totals */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3 uppercase tracking-wide">סיכום עונה</h2>
        <div className={`grid gap-2.5 ${tiles.length === 5 ? 'grid-cols-3 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4'}`}>
          {tiles.map(({ val, label, color }) => (
            <div key={label} className="card p-4 text-center">
              <p className={`text-2xl font-extrabold ${color}`}>{val}</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">{label}</p>
            </div>
          ))}
        </div>
        {form.length > 0 && (
          <div className="flex items-center gap-2.5 mt-3">
            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">{form.length} משחקים אחרונים</span>
            <div className="flex gap-1">
              {form.map((r, i) => (
                <span key={i} title={r === 'win' ? 'ניצחון' : r === 'loss' ? 'הפסד' : 'תיקו'}
                  className={`w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold text-white ${r === 'win' ? 'bg-emerald-500' : r === 'loss' ? 'bg-red-500' : 'bg-slate-400 dark:bg-slate-600'}`}>
                  {r === 'win' ? 'נ' : r === 'loss' ? 'ה' : 'ת'}
                </span>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {/* Per-game log */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
            <Calendar className="w-4 h-4 text-orange-500" /> יומן משחקים
          </h2>
          <div className="flex items-center gap-3">
            {comps.length > 2 && (
              <div className="flex gap-1">
                {comps.map(c => (
                  <button key={c.id} onClick={() => setLogFilter(c.id)}
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors ${logFilter === c.id ? 'bg-slate-900 dark:bg-orange-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                    {c.label}
                  </button>
                ))}
              </div>
            )}
            {gameLog.length > 0 && <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">{filteredLog.length} מתוך {gameLog.length}</span>}
          </div>
        </div>
        <div className="p-4 space-y-2">
          {filteredLog.length === 0 && (
            <p className="text-center text-slate-400 dark:text-slate-500 py-8 text-sm">אין משחקים מתועדים</p>
          )}
          {filteredLog.map(({ stat, game }) => {
            const isHome = game.home_team_id === player.team_id
            const opp = teamsMap[isHome ? game.away_team_id : game.home_team_id]
            const myScore = isHome ? game.home_score : game.away_score
            const oppScore = isHome ? game.away_score : game.home_score
            const result = myScore > oppScore ? 'win' : myScore < oppScore ? 'loss' : 'tie'
            const resultCls =
              result === 'win' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
              : result === 'loss' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
            return (
              <div key={stat.id} className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                {/* Opponent + meta (right side in RTL) */}
                <Link to={opp ? `/teams/${opp.id}` : '#'} className="flex items-center gap-2.5 min-w-0 group">
                  <TeamLogo team={opp} size={8} />
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-slate-900 dark:text-white truncate group-hover:text-orange-500 transition-colors">{opp?.name || '—'}</p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      {format(new Date(game.game_date), "d/M/yyyy")} · {isHome ? 'בית' : 'חוץ'}
                    </p>
                  </div>
                </Link>
                {/* Player's per-game contribution + result score (left side in RTL) */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {stat.goals > 0 && <span className="stat-pill bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 !py-0.5 !px-1.5">⚽ {stat.goals}</span>}
                  {stat.blue_cards > 0 && <span className="stat-pill bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 !py-0.5 !px-1.5">🟦 {stat.blue_cards}</span>}
                  {stat.red_cards > 0 && <span className="stat-pill bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 !py-0.5 !px-1.5">🟥 {stat.red_cards}</span>}
                  {isGK && stat.clean_sheet && <span className="stat-pill bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 !py-0.5 !px-1.5">🧤</span>}
                  {/* RTL score: away_score first, home_score last so each score lands
                      beside its team (see hockey-league-rtl-score-gotcha memory). */}
                  <span className={`text-sm font-bold px-2 py-1 rounded-md tabular-nums ${resultCls}`} title={result === 'win' ? 'ניצחון' : result === 'loss' ? 'הפסד' : 'תיקו'}>
                    {game.away_score}:{game.home_score}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </motion.div>
    </div>
  )
}
