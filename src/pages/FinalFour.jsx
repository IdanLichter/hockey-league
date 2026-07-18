import { useState, useEffect } from "react"
import { getTeams, getGames, getLeagueSetting } from "@/lib/api"
import { standingsComparator } from "@/lib/utils"
import { ageOf, DEFAULT_AGE } from "@/lib/ageGroups"
import { Trophy, Crown, Calendar, RefreshCw } from "lucide-react"
import { Trophy as TrophyIcon } from "@/components/icons/HockeyIcons"
import { motion } from "framer-motion"
import { format } from "date-fns"
import TeamLogo from "@/components/TeamLogo"
import { TeamLink } from "@/components/EntityLinks"

export default function FinalFour() {
  const [teams, setTeams] = useState([])
  const [games, setGames] = useState([])
  const [championId, setChampionId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true); setError(null)
    try {
      const [t, g] = await Promise.all([getTeams(), getGames()])
      setTeams(t); setGames(g)
    } catch (err) { console.error(err); setError("שגיאה בטעינת הנתונים"); setLoading(false); return }
    // Champion setting is optional — a failure here must not break the page.
    try {
      const cid = await getLeagueSetting('champion_team_id')
      setChampionId(cid || null)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const teamsMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const champion = championId ? teams.find(t => t.id === championId) || null : null
  const sorted = [...teams].filter(t => ageOf(t) === DEFAULT_AGE).sort(standingsComparator)
  const first = sorted[0]

  const playoffGames = games.filter(g => g.game_type === 'פלייאוף' || g.game_type === 'Final Four')

  // Playoff series: #2 vs #7, #3 vs #6, #4 vs #5
  const seriesA = sorted.length >= 7 ? { t1: sorted[1], t2: sorted[6], p1: 2, p2: 7 } : null
  const seriesB = sorted.length >= 7 ? { t1: sorted[2], t2: sorted[5], p1: 3, p2: 6 } : null
  const seriesC = sorted.length >= 7 ? { t1: sorted[3], t2: sorted[4], p1: 4, p2: 5 } : null

  // Find games for each series
  const getSeriesGames = (s) => {
    if (!s) return []
    return playoffGames.filter(g =>
      (g.home_team_id === s.t1?.id && g.away_team_id === s.t2?.id) ||
      (g.home_team_id === s.t2?.id && g.away_team_id === s.t1?.id)
    ).sort((a, b) => new Date(a.game_date) - new Date(b.game_date))
  }

  // Determine series winner
  const getSeriesWinner = (s, sGames) => {
    if (!s) return null
    let t1Wins = 0, t2Wins = 0
    for (const g of sGames) {
      if (g.status !== 'completed') continue
      const homeWin = g.home_score > g.away_score
      if ((g.home_team_id === s.t1.id && homeWin) || (g.away_team_id === s.t1.id && !homeWin)) t1Wins++
      else t2Wins++
    }
    // Best of 3 → need 2 wins
    if (t1Wins >= 2) return s.t1
    if (t2Wins >= 2) return s.t2
    return null
  }

  const seriesAGames = getSeriesGames(seriesA)
  const seriesBGames = getSeriesGames(seriesB)
  const seriesCGames = getSeriesGames(seriesC)

  const winnerA = getSeriesWinner(seriesA, seriesAGames)
  const winnerB = getSeriesWinner(seriesB, seriesBGames)
  const winnerC = getSeriesWinner(seriesC, seriesCGames)

  // Semi-finals: #1 vs winner of Series C (#4vs#5), winner A (#2vs#7) vs winner B (#3vs#6)
  const semi1 = { t1: first, t2: winnerC, label: "חצי גמר 1", dateTime: null }
  const semi2 = { t1: winnerA, t2: winnerB, label: "חצי גמר 2", dateTime: null }

  // Find semi-final games
  const getSemiGames = (s) => {
    if (!s.t1 || !s.t2) return []
    return playoffGames.filter(g =>
      g.playoff_round === 'semi_final' && (
        (g.home_team_id === s.t1?.id && g.away_team_id === s.t2?.id) ||
        (g.home_team_id === s.t2?.id && g.away_team_id === s.t1?.id)
      )
    ).sort((a, b) => new Date(a.game_date) - new Date(b.game_date))
  }

  const semi1Games = getSemiGames(semi1)
  const semi2Games = getSemiGames(semi2)
  const semi1Winner = semi1.t1 && semi1.t2 ? getSeriesWinner(semi1, semi1Games) : null
  const semi2Winner = semi2.t1 && semi2.t2 ? getSeriesWinner(semi2, semi2Games) : null

  // Semi-final losers for 3rd place match
  const semi1Loser = semi1Winner && semi1.t1 && semi1.t2 ? (semi1Winner.id === semi1.t1.id ? semi1.t2 : semi1.t1) : null
  const semi2Loser = semi2Winner && semi2.t1 && semi2.t2 ? (semi2Winner.id === semi2.t1.id ? semi2.t2 : semi2.t1) : null

  // 3rd place match
  const thirdPlaceGames = playoffGames.filter(g => g.playoff_round === 'third_place')
    .sort((a, b) => new Date(a.game_date) - new Date(b.game_date))

  // Final
  const finalGames = playoffGames.filter(g => g.playoff_round === 'final')
    .sort((a, b) => new Date(a.game_date) - new Date(b.game_date))

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-orange-500 border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
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
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-5">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="page-title flex items-center gap-2.5">
          <TrophyIcon className="w-7 h-7 text-orange-500" /> Final Four
        </h1>
        <p className="page-subtitle mt-1">שלב הגמר — עונת 2025-26</p>
      </motion.div>

      {/* === CHAMPION HERO === */}
      {champion && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.05 }}
          className="relative overflow-hidden bg-gradient-to-l from-amber-50 via-white to-amber-50 dark:from-amber-950/40 dark:via-slate-800 dark:to-amber-950/40 rounded-2xl border-2 border-amber-200 dark:border-amber-700 p-6 sm:p-8 shadow-lg text-center"
        >
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gold flex items-center justify-center shadow-lg shadow-gold/30">
              <Crown className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
            </div>
          </div>
          <p className="text-xs sm:text-sm font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">אלופת ה-Final Four</p>
          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">עונת 2025-26</p>
          <div className="flex items-center justify-center gap-3 mt-4">
            <TeamLogo team={champion} size={12} />
            <TeamLink team={champion} className="font-extrabold text-2xl sm:text-3xl text-slate-900 dark:text-white hover:text-orange-500 transition-colors">{champion.name}</TeamLink>
            <span className="text-3xl sm:text-4xl">🏆</span>
          </div>
        </motion.div>
      )}

      {/* === BRACKET === */}
      {/* Desktop bracket — hidden once the season is complete (champion set) */}
      <div className={champion ? "hidden" : "hidden lg:block"}>
        <div className="card p-6 overflow-hidden">
          <div className="bracket-container relative" style={{ minHeight: 520 }}>
            {/* Background gradient */}
            <div className="absolute inset-0 bg-gradient-to-l from-blue-950/5 via-orange-500/5 to-blue-950/5 dark:from-blue-900/10 dark:via-orange-500/10 dark:to-blue-900/10 rounded-xl" />

            <div className="relative grid grid-cols-5 gap-0 items-center" style={{ minHeight: 500 }}>

              {/* Column 1: Left side — Series C (#4vs#5) + #1 direct → Semi 1 */}
              <div className="flex flex-col justify-center gap-8 px-2">
                <PlayoffMatchup series={seriesC} games={seriesCGames} label="סדרה C" winner={winnerC} delay={0} />
                <DirectQualifier team={first} delay={0.1} />
              </div>

              {/* Column 2: Left Semi-final */}
              <div className="flex flex-col justify-center items-center px-2 relative">
                {/* Connector lines left */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
                  <line x1="0" y1="30%" x2="30%" y2="50%" stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeWidth="2" strokeDasharray="6 4" />
                  <line x1="0" y1="70%" x2="30%" y2="50%" stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeWidth="2" strokeDasharray="6 4" />
                  <line x1="70%" y1="50%" x2="100%" y2="50%" stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeWidth="2" strokeDasharray="6 4" />
                </svg>
                <SemiMatchup semi={semi1} games={semi1Games} winner={semi1Winner} delay={0.2} />
              </div>

              {/* Column 3: FINAL */}
              <div className="flex flex-col items-center justify-center px-2">
                <FinalMatchup t1={semi1Winner} t2={semi2Winner} games={finalGames} delay={0.4} />
              </div>

              {/* Column 4: Right Semi-final */}
              <div className="flex flex-col justify-center items-center px-2 relative">
                <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
                  <line x1="100%" y1="30%" x2="70%" y2="50%" stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeWidth="2" strokeDasharray="6 4" />
                  <line x1="100%" y1="70%" x2="70%" y2="50%" stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeWidth="2" strokeDasharray="6 4" />
                  <line x1="30%" y1="50%" x2="0" y2="50%" stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeWidth="2" strokeDasharray="6 4" />
                </svg>
                <SemiMatchup semi={semi2} games={semi2Games} winner={semi2Winner} delay={0.3} />
              </div>

              {/* Column 5: Right side — Series A (#2vs#7) + Series B (#3vs#6) → Semi 2 */}
              <div className="flex flex-col justify-center gap-8 px-2">
                <PlayoffMatchup series={seriesA} games={seriesAGames} label="סדרה A" winner={winnerA} delay={0.05} />
                <PlayoffMatchup series={seriesB} games={seriesBGames} label="סדרה B" winner={winnerB} delay={0.1} />
              </div>
            </div>

            {/* 3rd place match — inside the bracket card */}
            <div className="relative mt-4 flex justify-center">
              <div className="w-full max-w-md">
                <ThirdPlaceMatchup t1={semi1Loser} t2={semi2Loser} games={thirdPlaceGames} delay={0.5} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile bracket (stacked) — hidden once the season is complete (champion set) */}
      <div className={champion ? "hidden" : "lg:hidden space-y-4"}>
        {/* Playoffs */}
        <div className="card p-4">
          <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 text-center">פלייאוף</h2>
          <div className="space-y-3">
            <PlayoffMatchup series={seriesA} games={seriesAGames} label="סדרה A" winner={winnerA} delay={0} />
            <PlayoffMatchup series={seriesB} games={seriesBGames} label="סדרה B" winner={winnerB} delay={0.05} />
            <PlayoffMatchup series={seriesC} games={seriesCGames} label="סדרה C" winner={winnerC} delay={0.1} />
          </div>
        </div>

        {/* Direct qualifier */}
        <DirectQualifier team={first} delay={0.15} />

        {/* Semi-finals */}
        <div className="card p-4">
          <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 text-center">חצי גמר</h2>
          <div className="space-y-3">
            <SemiMatchup semi={semi1} games={semi1Games} winner={semi1Winner} delay={0.2} />
            <SemiMatchup semi={semi2} games={semi2Games} winner={semi2Winner} delay={0.25} />
          </div>
        </div>

        {/* Final */}
        <FinalMatchup t1={semi1Winner} t2={semi2Winner} games={finalGames} delay={0.3} />

        {/* 3rd place */}
        <ThirdPlaceMatchup t1={semi1Loser} t2={semi2Loser} games={thirdPlaceGames} delay={0.35} />
      </div>

      {/* First-round results — shown when the season is complete (champion set) */}
      {champion && (
        <div className="card p-4 sm:p-5">
          <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">תוצאות שלב הראשון</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <PlayoffMatchup series={seriesA} games={seriesAGames} label="סדרה A" winner={winnerA} delay={0} onlyCompleted />
            <PlayoffMatchup series={seriesB} games={seriesBGames} label="סדרה B" winner={winnerB} delay={0.05} onlyCompleted />
            <PlayoffMatchup series={seriesC} games={seriesCGames} label="סדרה C" winner={winnerC} delay={0.1} onlyCompleted />
          </div>
        </div>
      )}

      {/* Playoff Schedule */}
      {playoffGames.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
            <h2 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-500" /> לוח משחקי פלייאוף
            </h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {playoffGames
              .filter(game => !champion || game.status === 'completed')
              .sort((a, b) => new Date(a.game_date) - new Date(b.game_date)).map(game => (
              <div key={game.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="flex items-center gap-3">
                  <TeamLogo team={teamsMap[game.home_team_id]} size={8} />
                  <TeamLink team={teamsMap[game.home_team_id]} className="font-semibold text-sm text-slate-900 dark:text-white hover:text-orange-500 transition-colors">{teamsMap[game.home_team_id]?.name}</TeamLink>
                  <span className="text-xs text-slate-400 font-medium">vs</span>
                  <TeamLink team={teamsMap[game.away_team_id]} className="font-semibold text-sm text-slate-900 dark:text-white hover:text-orange-500 transition-colors">{teamsMap[game.away_team_id]?.name}</TeamLink>
                  <TeamLogo team={teamsMap[game.away_team_id]} size={8} />
                </div>
                <div className="text-left text-sm">
                  <p className="font-semibold text-slate-900 dark:text-white tabular-nums">{format(new Date(game.game_date), "d/M/yy")}</p>
                  <p className="text-xs text-slate-400">
                    {/* RTL score convention (away:home) — matches Games/TeamDetail/Archive */}
                    {game.status === 'completed' ? <span className="font-bold">{game.away_score} - {game.home_score}</span> : 'מתוכנן'}
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

// ============ BRACKET COMPONENTS ============

function TeamSlot({ team, pos, isWinner, isLoser }) {
  return (
    <div className={`flex items-center gap-2 p-2 rounded-lg transition-all ${
      isWinner
        ? 'bg-emerald-50 dark:bg-emerald-900/20 ring-1 ring-emerald-300 dark:ring-emerald-700'
        : isLoser
          ? 'bg-slate-50 dark:bg-slate-800/50 opacity-50'
          : 'bg-white dark:bg-slate-800'
    }`}>
      {team ? (
        <>
          <TeamLogo team={team} size={7} />
          <TeamLink team={team} className={`font-semibold text-xs flex-1 truncate hover:underline ${
            isWinner ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-900 dark:text-white'
          }`}>
            {team.name}
          </TeamLink>
          {pos && <span className="text-[10px] text-slate-400 font-mono">#{pos}</span>}
          {isWinner && <span className="text-[10px]">✓</span>}
        </>
      ) : (
        <>
          <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 border-2 border-dashed border-slate-300 dark:border-slate-600" />
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">ממתין</span>
        </>
      )}
    </div>
  )
}

function GameResult({ game }) {
  if (!game) return null
  return (
    <div className="flex items-center justify-between text-[11px] px-2 py-1 bg-slate-50 dark:bg-slate-800/50 rounded-md">
      <span className="text-slate-500 dark:text-slate-400">מ׳ {game.series_game || '—'}</span>
      <span className="text-slate-500 dark:text-slate-400">{format(new Date(game.game_date), "d/M")}</span>
      {game.status === 'completed'
        ? <span className="font-bold text-slate-900 dark:text-white tabular-nums">{game.away_score} - {game.home_score}</span>
        : <span className="text-blue-600 dark:text-blue-400 font-medium">מתוכנן</span>
      }
    </div>
  )
}

function PlayoffMatchup({ series, games, label, winner, delay, onlyCompleted }) {
  if (!series) return null
  const loser = winner ? (winner.id === series.t1.id ? series.t2 : series.t1) : null
  // When the season is complete, hide never-played "scheduled" ghost rows.
  const shownGames = onlyCompleted ? games.filter(g => g.status === 'completed') : games
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay }}
      className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 shadow-sm"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-md">{label}</span>
        {winner && <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">הוכרע</span>}
      </div>
      <div className="space-y-1.5">
        <TeamSlot team={series.t1} pos={series.p1} isWinner={winner?.id === series.t1.id} isLoser={loser?.id === series.t1.id} />
        <div className="flex items-center gap-2 px-2">
          <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
          <span className="text-[10px] font-bold text-slate-400">VS</span>
          <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
        </div>
        <TeamSlot team={series.t2} pos={series.p2} isWinner={winner?.id === series.t2.id} isLoser={loser?.id === series.t2.id} />
      </div>
      {shownGames.length > 0 && (
        <div className="mt-2 space-y-1">
          {shownGames.map(g => <GameResult key={g.id} game={g} />)}
        </div>
      )}
    </motion.div>
  )
}

function DirectQualifier({ team, delay }) {
  if (!team) return null
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay }}
      className="bg-gradient-to-l from-amber-50 to-white dark:from-amber-950/30 dark:to-slate-800 rounded-xl border-2 border-amber-200 dark:border-amber-700 p-3 shadow-sm"
    >
      <div className="flex items-center gap-1.5 mb-2">
        <Crown className="w-3.5 h-3.5 text-amber-500" />
        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">מקום 1 — ישיר לחצי הגמר</span>
      </div>
      <div className="flex items-center gap-2 p-2 bg-white/60 dark:bg-slate-800/60 rounded-lg">
        <TeamLogo team={team} size={8} />
        <TeamLink team={team} className="font-bold text-sm text-slate-900 dark:text-white hover:text-orange-500 transition-colors">{team.name}</TeamLink>
        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono mr-auto">#1</span>
      </div>
    </motion.div>
  )
}

function SemiMatchup({ semi, games, winner, delay }) {
  const loser = winner && semi.t1 && semi.t2 ? (winner.id === semi.t1.id ? semi.t2 : semi.t1) : null
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay }}
      className="bg-white dark:bg-slate-800 rounded-xl border-2 border-purple-200 dark:border-purple-800 p-3 shadow-sm w-full max-w-[220px] lg:max-w-none z-10"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-2 py-0.5 rounded-md">{semi.label}</span>
        {winner && <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">הוכרע</span>}
      </div>
      {semi.dateTime && (
        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mb-2 flex items-center gap-1">
          <Calendar className="w-3 h-3" /> {semi.dateTime}
        </p>
      )}
      <div className="space-y-1.5">
        <TeamSlot team={semi.t1} isWinner={winner?.id === semi.t1?.id} isLoser={loser?.id === semi.t1?.id} />
        <div className="flex items-center gap-2 px-2">
          <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
          <span className="text-[10px] font-bold text-slate-400">VS</span>
          <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
        </div>
        <TeamSlot team={semi.t2} isWinner={winner?.id === semi.t2?.id} isLoser={loser?.id === semi.t2?.id} />
      </div>
      {games.length > 0 && (
        <div className="mt-2 space-y-1">
          {games.map(g => <GameResult key={g.id} game={g} />)}
        </div>
      )}
    </motion.div>
  )
}

function FinalMatchup({ t1, t2, games, delay }) {
  const finalCompleted = games.filter(g => g.status === 'completed')
  let champion = null
  if (finalCompleted.length > 0) {
    // Check who won the final
    let t1Wins = 0, t2Wins = 0
    for (const g of finalCompleted) {
      if (!t1 || !t2) break
      const homeWin = g.home_score > g.away_score
      if ((g.home_team_id === t1.id && homeWin) || (g.away_team_id === t1.id && !homeWin)) t1Wins++
      else t2Wins++
    }
    if (t1Wins >= 2) champion = t1
    if (t2Wins >= 2) champion = t2
    // Single game final
    if (finalCompleted.length === 1 && !champion) {
      const g = finalCompleted[0]
      if (g.home_score > g.away_score) champion = t1?.id === g.home_team_id ? t1 : t2
      else champion = t1?.id === g.away_team_id ? t1 : t2
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay }}
      className="w-full max-w-[240px] lg:max-w-none mx-auto"
    >
      <div className="relative bg-gradient-to-b from-orange-50 via-white to-orange-50 dark:from-orange-950/30 dark:via-slate-800 dark:to-orange-950/30 rounded-2xl border-2 border-orange-300 dark:border-orange-700 p-4 shadow-lg">
        {/* Trophy icon */}
        <div className="flex justify-center mb-3">
          <div className="w-14 h-14 rounded-full bg-gold flex items-center justify-center shadow-lg shadow-gold/30">
            <Trophy className="w-7 h-7 text-white" />
          </div>
        </div>
        <h3 className="text-xs font-bold text-orange-600 dark:text-orange-400 text-center uppercase tracking-wider mb-3">גמר</h3>

        <div className="space-y-1.5">
          <TeamSlot team={t1} isWinner={champion?.id === t1?.id} isLoser={champion && champion?.id !== t1?.id} />
          <div className="flex items-center gap-2 px-2">
            <div className="flex-1 h-px bg-orange-200 dark:bg-orange-800" />
            <span className="text-[10px] font-bold text-orange-400">VS</span>
            <div className="flex-1 h-px bg-orange-200 dark:bg-orange-800" />
          </div>
          <TeamSlot team={t2} isWinner={champion?.id === t2?.id} isLoser={champion && champion?.id !== t2?.id} />
        </div>

        {games.length > 0 && (
          <div className="mt-2 space-y-1">
            {games.map(g => <GameResult key={g.id} game={g} />)}
          </div>
        )}

        {champion && (
          <div className="mt-3 p-2 bg-gradient-to-l from-amber-100 to-orange-100 dark:from-amber-900/40 dark:to-orange-900/40 rounded-lg text-center border border-amber-200 dark:border-amber-700">
            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold mb-1">אלוף הליגה</p>
            <div className="flex items-center justify-center gap-2">
              <TeamLogo team={champion} size={8} />
              <TeamLink team={champion} className="font-extrabold text-sm text-slate-900 dark:text-white hover:text-orange-500 transition-colors">{champion.name}</TeamLink>
              <span className="text-lg">🏆</span>
            </div>
          </div>
        )}

        {!champion && !t1 && !t2 && (
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium text-center mt-2">טרם נקבע</p>
        )}
      </div>
    </motion.div>
  )
}

function ThirdPlaceMatchup({ t1, t2, games, delay }) {
  const completed = games.filter(g => g.status === 'completed')
  let winner = null
  if (completed.length > 0 && t1 && t2) {
    const g = completed[0]
    const homeWin = g.home_score > g.away_score
    if ((g.home_team_id === t1.id && homeWin) || (g.away_team_id === t1.id && !homeWin)) winner = t1
    else winner = t2
  }
  const loser = winner && t1 && t2 ? (winner.id === t1.id ? t2 : t1) : null

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay }}
      className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-md">משחק על מקום 3/4</span>
        {winner && <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">הוכרע</span>}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <TeamSlot team={t1} isWinner={winner?.id === t1?.id} isLoser={loser?.id === t1?.id} />
        </div>
        <span className="text-[10px] font-bold text-slate-400">VS</span>
        <div className="flex-1">
          <TeamSlot team={t2} isWinner={winner?.id === t2?.id} isLoser={loser?.id === t2?.id} />
        </div>
      </div>

      {games.length > 0 && (
        <div className="mt-2 space-y-1">
          {games.map(g => <GameResult key={g.id} game={g} />)}
        </div>
      )}
    </motion.div>
  )
}
