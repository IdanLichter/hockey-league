import { standingsComparator } from "@/lib/utils"
import { ageOf, DEFAULT_AGE } from "@/lib/ageGroups"
import { Trophy, Crown } from "lucide-react"
import { Trophy as TrophyIcon } from "@/components/icons/HockeyIcons"
import { motion } from "framer-motion"
import { format } from "date-fns"
import TeamLogo from "@/components/TeamLogo"
import { TeamLink } from "@/components/EntityLinks"

// Full Final Four bracket — the path to the title, shown above the league table
// on the standings page (there is no separate Final Four page). Receives already
// loaded data as props; renders nothing until a bracket can actually be seeded.
// Palette is intentionally two-tone: neutral slate for structure, gold for the
// things that matter (winners, the league-winner's path, and the champion).
export default function FinalFourBracket({ teams = [], games = [], championId = null }) {
  const champion = championId ? teams.find(t => t.id === championId) || null : null
  const sorted = [...teams].filter(t => ageOf(t) === DEFAULT_AGE).sort(standingsComparator)
  const first = sorted[0]

  const playoffGames = games.filter(g => g.game_type === "פלייאוף" || g.game_type === "Final Four")

  // Playoff series: #2 vs #7, #3 vs #6, #4 vs #5
  const seriesA = sorted.length >= 7 ? { t1: sorted[1], t2: sorted[6], p1: 2, p2: 7 } : null
  const seriesB = sorted.length >= 7 ? { t1: sorted[2], t2: sorted[5], p1: 3, p2: 6 } : null
  const seriesC = sorted.length >= 7 ? { t1: sorted[3], t2: sorted[4], p1: 4, p2: 5 } : null

  const getSeriesGames = (s) => {
    if (!s) return []
    return playoffGames.filter(g =>
      (g.home_team_id === s.t1?.id && g.away_team_id === s.t2?.id) ||
      (g.home_team_id === s.t2?.id && g.away_team_id === s.t1?.id)
    ).sort((a, b) => new Date(a.game_date) - new Date(b.game_date))
  }

  // Determine series winner. A series was a two-game set, but some were settled
  // early (a team advanced after a single decisive leg, e.g. רמת ישי 4–0). So we
  // don't demand a fixed win count: whoever won more of the *completed* games
  // advances, with aggregate goals as the tie-break. This also serves the
  // single-game semis/final unchanged (1–0 in games → that team wins).
  const getSeriesWinner = (s, sGames) => {
    if (!s || !s.t1 || !s.t2) return null
    let t1Wins = 0, t2Wins = 0, t1Goals = 0, t2Goals = 0
    for (const g of sGames) {
      if (g.status !== "completed") continue
      const t1Home = g.home_team_id === s.t1.id
      const t1For = t1Home ? g.home_score : g.away_score
      const t2For = t1Home ? g.away_score : g.home_score
      t1Goals += t1For; t2Goals += t2For
      if (t1For > t2For) t1Wins++
      else if (t2For > t1For) t2Wins++
    }
    if (t1Wins === 0 && t2Wins === 0) return null   // nothing played yet
    if (t1Wins !== t2Wins) return t1Wins > t2Wins ? s.t1 : s.t2
    if (t1Goals !== t2Goals) return t1Goals > t2Goals ? s.t1 : s.t2
    return null
  }

  const seriesAGames = getSeriesGames(seriesA)
  const seriesBGames = getSeriesGames(seriesB)
  const seriesCGames = getSeriesGames(seriesC)

  const winnerA = getSeriesWinner(seriesA, seriesAGames)
  const winnerB = getSeriesWinner(seriesB, seriesBGames)
  const winnerC = getSeriesWinner(seriesC, seriesCGames)

  // Semi-finals: #1 vs winner of Series C (#4vs#5), winner A (#2vs#7) vs winner B (#3vs#6)
  const semi1 = { t1: first, t2: winnerC, label: "חצי גמר 1" }
  const semi2 = { t1: winnerA, t2: winnerB, label: "חצי גמר 2" }

  const getSemiGames = (s) => {
    if (!s.t1 || !s.t2) return []
    return playoffGames.filter(g =>
      g.playoff_round === "semi_final" && (
        (g.home_team_id === s.t1?.id && g.away_team_id === s.t2?.id) ||
        (g.home_team_id === s.t2?.id && g.away_team_id === s.t1?.id)
      )
    ).sort((a, b) => new Date(a.game_date) - new Date(b.game_date))
  }

  const semi1Games = getSemiGames(semi1)
  const semi2Games = getSemiGames(semi2)
  const semi1Winner = semi1.t1 && semi1.t2 ? getSeriesWinner(semi1, semi1Games) : null
  const semi2Winner = semi2.t1 && semi2.t2 ? getSeriesWinner(semi2, semi2Games) : null

  const semi1Loser = semi1Winner && semi1.t1 && semi1.t2 ? (semi1Winner.id === semi1.t1.id ? semi1.t2 : semi1.t1) : null
  const semi2Loser = semi2Winner && semi2.t1 && semi2.t2 ? (semi2Winner.id === semi2.t1.id ? semi2.t2 : semi2.t1) : null

  const thirdPlaceGames = playoffGames.filter(g => g.playoff_round === "third_place")
    .sort((a, b) => new Date(a.game_date) - new Date(b.game_date))

  const finalGames = playoffGames.filter(g => g.playoff_round === "final")
    .sort((a, b) => new Date(a.game_date) - new Date(b.game_date))

  // Nothing to show until there is a bracket to seed and some playoff activity.
  if (sorted.length < 7 || (playoffGames.length === 0 && !champion)) return null

  const connector = "text-slate-300 dark:text-slate-600"

  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }} className="space-y-4">
      {/* Section header — champion inline, no separate hero */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-black text-fg-strong flex items-center gap-2">
            <TrophyIcon className="size-6 text-gold" /> פיינל פור
          </h2>
          <p className="text-xs text-fg-muted mt-0.5">שלב הגמר — עונת 2025-26</p>
        </div>
        {champion && (
          <span className="flex items-center gap-1.5 text-sm font-bold text-fg-strong bg-gold/[0.12] ring-1 ring-gold/30 rounded-full px-3 py-1.5">
            <Crown className="size-4 text-gold" /> אלופה:
            <TeamLink team={champion} className="text-gold hover:underline">{champion.name}</TeamLink> 🏆
          </span>
        )}
      </div>

      {/* Desktop bracket — the full path to the title, filled with results. */}
      <div className="hidden lg:block">
        <div className="card p-6 overflow-hidden">
          <div className="bracket-container relative" style={{ minHeight: 520 }}>
            <div className="relative grid grid-cols-5 gap-0 items-center" style={{ minHeight: 500 }}>
              {/* Column 1 (right in RTL): Series C (#4vs#5) + #1 direct → Semi 1 */}
              <div className="flex flex-col justify-center gap-8 px-2">
                <PlayoffMatchup series={seriesC} games={seriesCGames} label="סדרה C" winner={winnerC} delay={0} onlyCompleted={!!champion} />
                <DirectQualifier team={first} delay={0.1} />
              </div>

              {/* Column 2: Left Semi-final (fed from column 1, which is to the RIGHT in RTL).
                  self-stretch makes this column full-height so the connectors reach the source
                  cards' vertical levels (Series C up top, the league winner lower down) instead
                  of hugging the semi card. */}
              <div className="flex flex-col justify-center items-center px-2 relative self-stretch">
                <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
                  {/* Series C winner → semi (from the upper right) */}
                  <line x1="100%" y1="32%" x2="58%" y2="50%" stroke="currentColor" className={connector} strokeWidth="2" />
                  {/* #1 seed's direct path → semi (from the lower right) */}
                  <line x1="100%" y1="70%" x2="58%" y2="50%" stroke="currentColor" className={connector} strokeWidth="2" />
                  {/* semi → final (to the left) */}
                  <line x1="42%" y1="50%" x2="0%" y2="50%" stroke="currentColor" className={connector} strokeWidth="2" />
                </svg>
                <SemiMatchup semi={semi1} games={semi1Games} winner={semi1Winner} delay={0.2} />
              </div>

              {/* Column 3: FINAL */}
              <div className="flex flex-col items-center justify-center px-2">
                <FinalMatchup t1={semi1Winner} t2={semi2Winner} games={finalGames} delay={0.4} />
              </div>

              {/* Column 4: Right Semi-final (fed from column 5, which is to the LEFT in RTL) */}
              <div className="flex flex-col justify-center items-center px-2 relative self-stretch">
                <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
                  {/* Series A → semi (from the upper left) */}
                  <line x1="0%" y1="32%" x2="42%" y2="50%" stroke="currentColor" className={connector} strokeWidth="2" />
                  {/* Series B → semi (from the lower left) */}
                  <line x1="0%" y1="70%" x2="42%" y2="50%" stroke="currentColor" className={connector} strokeWidth="2" />
                  {/* semi → final (to the right) */}
                  <line x1="58%" y1="50%" x2="100%" y2="50%" stroke="currentColor" className={connector} strokeWidth="2" />
                </svg>
                <SemiMatchup semi={semi2} games={semi2Games} winner={semi2Winner} delay={0.3} />
              </div>

              {/* Column 5 (left in RTL): Series A (#2vs#7) + Series B (#3vs#6) → Semi 2 */}
              <div className="flex flex-col justify-center gap-8 px-2">
                <PlayoffMatchup series={seriesA} games={seriesAGames} label="סדרה A" winner={winnerA} delay={0.05} onlyCompleted={!!champion} />
                <PlayoffMatchup series={seriesB} games={seriesBGames} label="סדרה B" winner={winnerB} delay={0.1} onlyCompleted={!!champion} />
              </div>
            </div>

            {thirdPlaceGames.length > 0 && (
              <div className="relative mt-4 flex justify-center">
                <div className="w-full max-w-md">
                  <ThirdPlaceMatchup t1={semi1Loser} t2={semi2Loser} games={thirdPlaceGames} delay={0.5} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile bracket (stacked) */}
      <div className="lg:hidden space-y-4">
        <div className="card p-4">
          <h3 className="text-xs font-bold text-fg-subtle uppercase tracking-wider mb-3 text-center">שלב ראשון</h3>
          <div className="space-y-3">
            <PlayoffMatchup series={seriesA} games={seriesAGames} label="סדרה A" winner={winnerA} delay={0} onlyCompleted={!!champion} />
            <PlayoffMatchup series={seriesB} games={seriesBGames} label="סדרה B" winner={winnerB} delay={0.05} onlyCompleted={!!champion} />
            <PlayoffMatchup series={seriesC} games={seriesCGames} label="סדרה C" winner={winnerC} delay={0.1} onlyCompleted={!!champion} />
          </div>
        </div>

        <DirectQualifier team={first} delay={0.15} />

        <div className="card p-4">
          <h3 className="text-xs font-bold text-fg-subtle uppercase tracking-wider mb-3 text-center">חצי גמר</h3>
          <div className="space-y-3">
            <SemiMatchup semi={semi1} games={semi1Games} winner={semi1Winner} delay={0.2} />
            <SemiMatchup semi={semi2} games={semi2Games} winner={semi2Winner} delay={0.25} />
          </div>
        </div>

        <FinalMatchup t1={semi1Winner} t2={semi2Winner} games={finalGames} delay={0.3} />

        {thirdPlaceGames.length > 0 && (
          <ThirdPlaceMatchup t1={semi1Loser} t2={semi2Loser} games={thirdPlaceGames} delay={0.35} />
        )}
      </div>
    </motion.section>
  )
}

// ============ BRACKET COMPONENTS ============

function TeamSlot({ team, pos, isWinner, isLoser }) {
  return (
    <div className={`flex items-center gap-2 p-2 rounded-lg transition-all ${
      isWinner
        ? "bg-gold/[0.08] ring-1 ring-gold/30"
        : isLoser
          ? "bg-slate-50 dark:bg-slate-800/50 opacity-50"
          : "bg-white dark:bg-slate-800"
    }`}>
      {team ? (
        <>
          <TeamLogo team={team} size={7} />
          <TeamLink team={team} className="font-semibold text-xs flex-1 truncate text-fg-strong hover:text-brand hover:underline transition-colors">
            {team.name}
          </TeamLink>
          {pos && <span className="text-[10px] text-fg-subtle font-mono">#{pos}</span>}
          {isWinner && <span className="text-[10px] text-gold">✓</span>}
        </>
      ) : (
        <>
          <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 border-2 border-dashed border-slate-300 dark:border-slate-600" />
          <span className="text-xs text-fg-subtle font-medium">ממתין</span>
        </>
      )}
    </div>
  )
}

function GameResult({ game }) {
  if (!game) return null
  return (
    <div className="flex items-center justify-between text-[11px] px-2 py-1 bg-surface-inset rounded-md">
      {game.series_game
        ? <span className="text-fg-subtle">מ׳ {game.series_game}</span>
        : <span />}
      <span className="text-fg-subtle">{format(new Date(game.game_date), "d/M")}</span>
      {game.status === "completed"
        ? <span className="font-bold text-fg-strong tabular-nums">{game.away_score} - {game.home_score}</span>
        : <span className="text-fg-muted font-medium">מתוכנן</span>
      }
    </div>
  )
}

function PlayoffMatchup({ series, games, label, winner, delay, onlyCompleted }) {
  if (!series) return null
  const loser = winner ? (winner.id === series.t1.id ? series.t2 : series.t1) : null
  const shownGames = onlyCompleted ? games.filter(g => g.status === "completed") : games
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay }}
      className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 shadow-sm"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-fg-muted bg-surface-inset px-2 py-0.5 rounded-md">{label}</span>
        {winner && <span className="text-[10px] font-bold text-gold">הוכרע</span>}
      </div>
      <div className="space-y-1.5">
        <TeamSlot team={series.t1} pos={series.p1} isWinner={winner?.id === series.t1.id} isLoser={loser?.id === series.t1.id} />
        <div className="flex items-center gap-2 px-2">
          <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
          <span className="text-[10px] font-bold text-fg-subtle">VS</span>
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

// The league winner's direct-to-semi card. Given a subtle gold tint (it is the
// team that topped the table) — the gold connector line leads out of it.
function DirectQualifier({ team, delay }) {
  if (!team) return null
  return (
    <motion.div
      data-ff-anchor="direct-qualifier"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay }}
      className="bg-gold/[0.06] rounded-xl border border-gold/30 p-3 shadow-sm"
    >
      <div className="flex items-center gap-1.5 mb-2">
        <Crown className="w-3.5 h-3.5 text-gold" />
        <span className="text-[10px] font-bold text-gold">מקום 1 — ישיר לחצי הגמר</span>
      </div>
      <div className="flex items-center gap-2 p-2 bg-white/60 dark:bg-slate-800/60 rounded-lg">
        <TeamLogo team={team} size={8} />
        <TeamLink team={team} className="font-bold text-sm text-fg-strong hover:text-brand transition-colors">{team.name}</TeamLink>
        <span className="text-[10px] text-gold font-mono mr-auto">#1</span>
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
      className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 shadow-sm w-full max-w-[220px] lg:max-w-none z-10"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold text-fg-muted bg-surface-inset px-2 py-0.5 rounded-md">{semi.label}</span>
        {winner && <span className="text-[10px] font-bold text-gold">הוכרע</span>}
      </div>
      <div className="space-y-1.5">
        <TeamSlot team={semi.t1} isWinner={winner?.id === semi.t1?.id} isLoser={loser?.id === semi.t1?.id} />
        <div className="flex items-center gap-2 px-2">
          <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
          <span className="text-[10px] font-bold text-fg-subtle">VS</span>
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
  const finalCompleted = games.filter(g => g.status === "completed")
  let champion = null
  if (finalCompleted.length > 0) {
    let t1Wins = 0, t2Wins = 0
    for (const g of finalCompleted) {
      if (!t1 || !t2) break
      const homeWin = g.home_score > g.away_score
      if ((g.home_team_id === t1.id && homeWin) || (g.away_team_id === t1.id && !homeWin)) t1Wins++
      else t2Wins++
    }
    if (t1Wins >= 2) champion = t1
    if (t2Wins >= 2) champion = t2
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
      <div className="relative bg-gold/[0.06] rounded-2xl border-2 border-gold/40 p-4 shadow-lg">
        <div className="flex justify-center mb-3">
          <div className="w-14 h-14 rounded-full bg-gold flex items-center justify-center shadow-lg shadow-gold/30">
            <Trophy className="w-7 h-7 text-white" />
          </div>
        </div>
        <h3 className="text-xs font-bold text-gold text-center uppercase tracking-wider mb-3">גמר</h3>

        <div className="space-y-1.5">
          <TeamSlot team={t1} isWinner={champion?.id === t1?.id} isLoser={champion && champion?.id !== t1?.id} />
          <div className="flex items-center gap-2 px-2">
            <div className="flex-1 h-px bg-gold/30" />
            <span className="text-[10px] font-bold text-fg-subtle">VS</span>
            <div className="flex-1 h-px bg-gold/30" />
          </div>
          <TeamSlot team={t2} isWinner={champion?.id === t2?.id} isLoser={champion && champion?.id !== t2?.id} />
        </div>

        {games.length > 0 && (
          <div className="mt-2 space-y-1">
            {games.map(g => <GameResult key={g.id} game={g} />)}
          </div>
        )}

        {champion && (
          <div className="mt-3 p-2 bg-gold/[0.12] rounded-lg text-center border border-gold/30">
            <p className="text-[10px] text-gold font-bold mb-1">אלוף הליגה</p>
            <div className="flex items-center justify-center gap-2">
              <TeamLogo team={champion} size={8} />
              <TeamLink team={champion} className="font-extrabold text-sm text-fg-strong hover:text-brand transition-colors">{champion.name}</TeamLink>
              <span className="text-lg">🏆</span>
            </div>
          </div>
        )}

        {!champion && !t1 && !t2 && (
          <p className="text-xs text-fg-subtle font-medium text-center mt-2">טרם נקבע</p>
        )}
      </div>
    </motion.div>
  )
}

function ThirdPlaceMatchup({ t1, t2, games, delay }) {
  const completed = games.filter(g => g.status === "completed")
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
        <span className="text-[10px] font-bold text-fg-muted bg-surface-inset px-2 py-0.5 rounded-md">משחק על מקום 3/4</span>
        {winner && <span className="text-[10px] font-bold text-gold">הוכרע</span>}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <TeamSlot team={t1} isWinner={winner?.id === t1?.id} isLoser={loser?.id === t1?.id} />
        </div>
        <span className="text-[10px] font-bold text-fg-subtle">VS</span>
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
