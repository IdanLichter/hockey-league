import { useState, useEffect, useMemo } from "react"
import { Link } from "react-router-dom"
import { getTeams, getPlayers, getGames, getReferees, getGameStats } from "@/lib/api"
import { BarChart3, Shield, Crown, ChevronDown, ChevronUp, RefreshCw, Trophy, TrendingUp, CalendarDays, Flame, Zap, Target } from "lucide-react"
import { Player, Glove, Cards, Whistle, StickBall, BlueCard, RedCard, Goal, Crossed } from "@/components/icons/HockeyIcons"
import { motion } from "framer-motion"
import TeamLogo from "@/components/TeamLogo"
import { PlayerLink } from "@/components/EntityLinks"
import { useTheme } from "@/lib/ThemeContext"
import { seriesColors, teamColorIndex } from "@/lib/chartPalette"
import {
  leagueSummary, monthlyGoals, cumulativeTeamGoals, teamGoalDiff,
  playerAchievements, achievementsOverTime, goalkeeperCleanSheets,
  seasonMonths, monthStartMs, shortMonthLabel,
} from "@/lib/leagueStats"
import { valueAt } from "@/components/charts/chartUtils"
import ChartCard from "@/components/charts/ChartCard"
import BarChart from "@/components/charts/BarChart"
import LineChart from "@/components/charts/LineChart"
import DivergingBar from "@/components/charts/DivergingBar"
import StatTile from "@/components/charts/StatTile"
import Legend from "@/components/charts/Legend"

// game_stats only exists for 40 of the 45 completed games — anything derived
// from it must carry this caveat (per the data contract for this page).
const STATS_NOTE = "מבוסס על 40 מתוך 45 משחקים עם סטטיסטיקות שחקנים"

export default function Statistics() {
  const { dark } = useTheme()
  const [teams, setTeams] = useState([])
  const [players, setPlayers] = useState([])
  const [games, setGames] = useState([])
  const [referees, setReferees] = useState([])
  const [gameStats, setGameStats] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState("scorers")
  const [expanded, setExpanded] = useState({})

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      setLoading(true); setError(null)
      const [t, p, g, r, s] = await Promise.all([getTeams(), getPlayers(), getGames(), getReferees(), getGameStats()])
      setTeams(t); setPlayers(p); setGames(g); setReferees(r); setGameStats(s)
    } catch (err) { console.error(err); setError("שגיאה בטעינת הנתונים") }
    finally { setLoading(false) }
  }

  const toggle = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))
  const teamName = (id) => teams.find(t => t.id === id)?.name || '—'

  // ---- Tab data (unchanged behaviour) ----
  const topScorers = players.filter(p => p.position === 'Field Player').sort((a, b) => (b.goals || 0) - (a.goals || 0))

  const topPerTeam = teams.map(team => {
    const best = players.filter(p => p.team_id === team.id && p.position === 'Field Player')
      .reduce((b, p) => (p.goals || 0) > (b?.goals || 0) ? p : b, null)
    return best ? { ...best, team } : null
  }).filter(Boolean).sort((a, b) => (b.goals || 0) - (a.goals || 0))

  // Canonical clean-sheet computation, now shared from leagueStats.
  const goalkeepers = useMemo(() => goalkeeperCleanSheets(players, games), [players, games])

  const bluePlayers = players.filter(p => (p.blue_cards || 0) > 0).sort((a, b) => b.blue_cards - a.blue_cards)
  const redPlayers = players.filter(p => (p.red_cards || 0) > 0).sort((a, b) => b.red_cards - a.red_cards)
  const blueTeams = teams.map(t => ({ ...t, total_blue: players.filter(p => p.team_id === t.id).reduce((s, p) => s + (p.blue_cards || 0), 0) })).filter(t => t.total_blue > 0).sort((a, b) => b.total_blue - a.total_blue)

  const refStats = useMemo(() => {
    const rel = games.filter(g => g.referee_id && ['completed', 'scheduled'].includes(g.status))
    const m = new Map()
    rel.forEach(g => {
      const k = `${g.referee_type}-${g.referee_id}`
      if (!m.has(k)) {
        const ref = (g.referee_type === 'player' ? players : referees).find(r => r.id === g.referee_id)
        if (ref) m.set(k, { ...ref, type: g.referee_type, completed: 0, scheduled: 0, total: 0 })
      }
      if (m.has(k)) { const r = m.get(k); g.status === 'completed' ? r.completed++ : r.scheduled++; r.total++ }
    })
    return Array.from(m.values()).sort((a, b) => b.total - a.total)
  }, [games, players, referees])

  // ---- Overview + charts (all sourced from `games`, complete) ----
  const summary = useMemo(() => leagueSummary(games), [games])
  const monthly = useMemo(() => monthlyGoals(games), [games])
  const goalDiff = useMemo(() => teamGoalDiff(games, teams), [games, teams])
  const achTime = useMemo(() => achievementsOverTime(gameStats, games), [gameStats, games])
  const achievements = useMemo(() => playerAchievements(gameStats, players), [gameStats, players])

  const xTicks = useMemo(
    () => seasonMonths(games).map(k => ({ x: monthStartMs(k), label: shortMonthLabel(k) })),
    [games]
  )

  // Race series — colour follows the ENTITY via the fixed team→slot map, never rank.
  const { raceSeries, legendItems } = useMemo(() => {
    const idx = teamColorIndex(teams)
    const palette = seriesColors(dark)
    const series = cumulativeTeamGoals(games, teams)
      .map(s => ({ ...s, id: s.teamId, color: palette[idx[s.teamId]] }))
      .sort((a, b) => b.total - a.total)
    return {
      raceSeries: series,
      legendItems: series.map(s => ({ id: s.teamId, name: s.name, color: s.color, team: s.team })),
    }
  }, [games, teams, dark])

  // Cumulative-at-end-of-month matrix for the race chart's table view.
  const raceMonths = useMemo(() => seasonMonths(games), [games])
  const raceTable = useMemo(() => ({
    head: ['קבוצה', ...raceMonths.map(shortMonthLabel), 'סה״כ'],
    align: ['right', ...raceMonths.map(() => 'center'), 'center'],
    rows: raceSeries.map(s => {
      const cells = raceMonths.map((m, i) => {
        const end = i + 1 < raceMonths.length ? monthStartMs(raceMonths[i + 1]) - 1 : Infinity
        return valueAt(s.points, end)
      })
      return [
        <span className="inline-flex items-center gap-1.5"><TeamLogo team={s.team} size={5} />{s.name}</span>,
        ...cells,
        <span className="font-bold">{s.total}</span>,
      ]
    }),
  }), [raceSeries, raceMonths])

  // ---- Awards (derived) ----
  const awardHat = achievements.players.filter(p => p.hatTricks > 0).sort((a, b) => b.hatTricks - a.hatTricks || b.gamesWithGoal - a.gamesWithGoal)
  const awardBig = achievements.players.filter(p => p.bigGames > 0).sort((a, b) => b.bigGames - a.bigGames)
  const awardBrace = achievements.players.filter(p => p.braces > 0).sort((a, b) => b.braces - a.braces)
  const awardClean = goalkeepers.filter(g => g.clean_sheets > 0)
  const awardBlue = bluePlayers

  const tabs = [
    { id: "scorers", label: "מבקיעים", icon: Player },
    { id: "goalkeepers", label: "שוערים", icon: Glove },
    { id: "cards", label: "כרטיסים", icon: Cards },
    { id: "referees", label: "שופטים", icon: Whistle },
  ]

  const medal = (i) =>
    i === 0 ? 'bg-amber-400 text-amber-950' :
    i === 1 ? 'bg-slate-300 dark:bg-slate-500 text-slate-800 dark:text-white' :
    i === 2 ? 'bg-orange-300 dark:bg-orange-700 text-orange-900 dark:text-white' :
    'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'

  const List = ({ title, icon, data, render, tKey, empty }) => {
    const exp = expanded[tKey]
    const show = exp ? data : data.slice(0, 5)
    return (
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h3 className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">{icon} {title}</h3>
        </div>
        <div className="p-4 space-y-2">
          {show.map((item, i) => render(item, i))}
          {data.length === 0 && <p className="text-center text-slate-400 dark:text-slate-500 py-6 text-sm">{empty}</p>}
          {data.length > 5 && (
            <button onClick={() => toggle(tKey)} className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 py-2 mt-1 border border-slate-100 dark:border-slate-700 rounded-lg transition-colors">
              {exp ? <><ChevronUp className="w-3.5 h-3.5" /> הצג פחות</> : <><ChevronDown className="w-3.5 h-3.5" /> הצג הכל ({data.length})</>}
            </button>
          )}
        </div>
      </div>
    )
  }

  const PlayerRow = ({ player, index, value, color = "bg-slate-900 dark:bg-orange-500" }) => (
    <Link to={`/players/${player.id}`} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors group">
      <div className="flex items-center gap-2.5">
        <span className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold ${medal(index)}`}>{index + 1}</span>
        <div>
          <p className="font-semibold text-sm text-slate-900 dark:text-white group-hover:text-orange-500 transition-colors">{player.first_name} {player.last_name}</p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">{teamName(player.team_id)}</p>
        </div>
      </div>
      <span className={`${color} text-white text-xs font-bold px-2.5 py-1 rounded-md`}>{value}</span>
    </Link>
  )

  // Compact award card: top-5 players, medal styling, links to the player page.
  const AwardCard = ({ title, icon, data, valueOf, unit, badge = "bg-slate-900 dark:bg-orange-500", empty = "אין נתונים", note }) => (
    <div className="card p-4">
      <h3 className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white mb-3">{icon} {title}</h3>
      <div className="space-y-2">
        {data.slice(0, 5).map((p, i) => (
          <PlayerLink key={p.id} playerId={p.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors group">
            <span className="flex items-center gap-2 min-w-0">
              <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${medal(i)}`}>{i + 1}</span>
              <span className="min-w-0">
                <span className="block font-semibold text-[13px] text-slate-900 dark:text-white truncate group-hover:text-orange-500 transition-colors">{p.first_name} {p.last_name}</span>
                <span className="block text-[10px] text-slate-400 dark:text-slate-500 truncate">{teamName(p.team_id)}</span>
              </span>
            </span>
            <span className={`${badge} text-white text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0`}>{valueOf(p)}{unit ? ` ${unit}` : ''}</span>
          </PlayerLink>
        ))}
        {data.length === 0 && <p className="text-center text-slate-400 dark:text-slate-500 py-4 text-xs">{empty}</p>}
      </div>
      {note && <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2.5">{note}</p>}
    </div>
  )

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

  const biggest = summary.highestScoringGame

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="page-title flex items-center gap-2.5">
          <BarChart3 className="w-7 h-7 text-orange-500" /> סטטיסטיקות
        </h1>
        <p className="page-subtitle mt-1">נתוני ביצועים עונת 2025-26</p>
      </motion.div>

      {/* Overview tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatTile icon={<Crossed className="w-5 h-5" mono />} value={summary.completedGames} label="משחקים" />
        <StatTile icon={<Goal className="w-5 h-5" mono />} value={summary.totalGoals} label="שערים" accent="brand" spark={monthly.map(m => m.goals)} />
        <StatTile icon={<TrendingUp className="w-5 h-5" />} value={summary.avgPerGame.toFixed(1)} label="ממוצע למשחק" />
        <StatTile icon={<Glove className="w-5 h-5" mono />} value={summary.shutouts} label="בלימות" sub="משחקים ללא ספיגה" />
        {biggest && (
          <StatTile
            icon={<Flame className="w-5 h-5" />}
            value={summary.highestTotal}
            label="משחק שיא"
            sub={`${teamName(biggest.home_team_id)} נגד ${teamName(biggest.away_team_id)}`}
            to={`/games/${biggest.id}`}
          />
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="שערים לאורך העונה"
          subtitle="סך שערי הליגה בכל חודש"
          icon={<CalendarDays className="w-4 h-4 text-orange-500" />}
          footnote="מבוסס על כל 45 המשחקים שהסתיימו · אפריל ללא משחקים"
          table={{
            head: ['חודש', 'משחקים', 'שערים', 'ממוצע'],
            align: ['right', 'center', 'center', 'center'],
            rows: monthly.map(m => [m.label, m.games, m.goals, m.games ? m.avg.toFixed(1) : '—']),
          }}
        >
          <BarChart data={monthly.map(m => ({ label: m.label, value: m.goals, lines: m.games ? [`${m.games} משחקים · ${m.avg.toFixed(1)} לממוצע`] : ['ללא משחקים'] }))} unit="שערים" />
        </ChartCard>

        <ChartCard
          title="מרוץ השערים"
          subtitle="שערים מצטברים לאורך העונה, לפי קבוצה"
          icon={<TrendingUp className="w-4 h-4 text-orange-500" />}
          legend={<Legend items={legendItems} />}
          table={raceTable}
        >
          <LineChart series={raceSeries} xTicks={xTicks} />
        </ChartCard>

        <ChartCard
          title="הפרש שערים"
          subtitle="זכות פחות חובה, לפי קבוצה"
          icon={<Target className="w-4 h-4 text-orange-500" />}
          table={{
            head: ['קבוצה', 'זכות', 'חובה', 'הפרש'],
            align: ['right', 'center', 'center', 'center'],
            rows: goalDiff.map(d => [
              <span className="inline-flex items-center gap-1.5"><TeamLogo team={d.team} size={5} />{d.name}</span>,
              d.gf, d.ga, d.gd > 0 ? `+${d.gd}` : d.gd,
            ]),
          }}
        >
          <DivergingBar data={goalDiff} />
        </ChartCard>

        <ChartCard
          title="שלישיות לפי חודש"
          subtitle="שלישיות (3–4 שערים) בכל חודש"
          icon={<Flame className="w-4 h-4 text-orange-500" />}
          footnote={STATS_NOTE}
          table={{
            head: ['חודש', 'שלישיות', 'משחקי-על'],
            align: ['right', 'center', 'center'],
            rows: achTime.map(a => [a.label, a.hatTricks, a.bigGames]),
          }}
        >
          <BarChart data={achTime.map(a => ({ label: a.label, value: a.hatTricks, lines: a.bigGames ? [`${a.bigGames} משחקי-על (5+)`] : [] }))} unit="שלישיות" />
        </ChartCard>
      </div>

      {/* Awards */}
      <div>
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900 dark:text-white mb-3">
          <Trophy className="w-5 h-5 text-amber-500" /> הישגים ותארים
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <AwardCard title="מלכי השלישיות" icon={<StickBall className="w-4 h-4 text-orange-500" />} data={awardHat} valueOf={p => p.hatTricks} badge="bg-orange-500" empty="אין שלישיות" note={STATS_NOTE} />
          <AwardCard title="משחקי-על (5+ שערים)" icon={<Zap className="w-4 h-4 text-amber-500" />} data={awardBig} valueOf={p => p.bigGames} badge="bg-amber-500" empty="אין" note={STATS_NOTE} />
          <AwardCard title="דאבלים (2 שערים)" icon={<Target className="w-4 h-4 text-slate-500" />} data={awardBrace} valueOf={p => p.braces} badge="bg-slate-700 dark:bg-slate-500" empty="אין" note={STATS_NOTE} />
          <AwardCard title="שוערי הברזל" icon={<Glove className="w-4 h-4 text-blue-500" />} data={awardClean} valueOf={p => p.clean_sheets} unit="נקיות" badge="bg-blue-500" empty="אין" />
          <AwardCard title="כרטיסים כחולים" icon={<BlueCard className="w-4 h-4" />} data={awardBlue} valueOf={p => p.blue_cards} badge="bg-blue-500" empty="אין" />
        </div>
      </div>

      {/* Detailed tabbed lists */}
      <div className="space-y-5 pt-1">
        <div className="tab-bar overflow-x-auto">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={activeTab === tab.id ? "tab-active" : "tab-inactive"}>
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "scorers" && (
          <div className="space-y-4">
            <List title="מלכי השערים" icon={<StickBall className="w-4 h-4 text-orange-500" />} data={topScorers} tKey="top" empty="אין נתונים"
              render={(p, i) => <PlayerRow key={p.id} player={p} index={i} value={`${p.goals || 0} שערים`} />} />
            <List title="מצטיין מכל קבוצה" icon={<Crown className="w-4 h-4 text-amber-500" />} data={topPerTeam} tKey="perTeam" empty="אין נתונים"
              render={(p, i) => <PlayerRow key={p.id} player={p} index={i} value={`${p.goals || 0}`} color="bg-amber-500" />} />
          </div>
        )}

        {activeTab === "goalkeepers" && (
          <List title="שוערי הברזל" icon={<Glove className="w-4 h-4 text-blue-500" />} data={goalkeepers} tKey="gk" empty="אין שוערים"
            render={(gk, i) => (
              <Link key={gk.id} to={`/players/${gk.id}`} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors group">
                <div className="flex items-center gap-2.5">
                  <span className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold ${medal(i)}`}>{i + 1}</span>
                  <div>
                    <p className="font-semibold text-sm text-slate-900 dark:text-white group-hover:text-orange-500 transition-colors">{gk.first_name} {gk.last_name}</p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">{teamName(gk.team_id)} • {gk.total_games} משחקים</p>
                  </div>
                </div>
                <span className="bg-blue-500 text-white text-xs font-bold px-2.5 py-1 rounded-md">{gk.clean_sheets} נקיות</span>
              </Link>
            )} />
        )}

        {activeTab === "cards" && (
          <div className="space-y-4">
            <List title="כרטיסים כחולים" icon={<BlueCard className="w-4 h-4" />} data={bluePlayers} tKey="blue" empty="אין"
              render={(p, i) => <PlayerRow key={p.id} player={p} index={i} value={p.blue_cards} color="bg-blue-500" />} />
            <List title="כחולים לפי קבוצה" icon={<Shield className="w-4 h-4 text-blue-500" />} data={blueTeams} tKey="blueT" empty="אין"
              render={(t, i) => (
                <Link key={t.id} to={`/teams/${t.id}`} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors group">
                  <div className="flex items-center gap-2.5">
                    <TeamLogo team={t} size={6} />
                    <span className="font-semibold text-sm text-slate-900 dark:text-white group-hover:text-orange-500 transition-colors">{t.name}</span>
                  </div>
                  <span className="bg-blue-500 text-white text-xs font-bold px-2.5 py-1 rounded-md">{t.total_blue}</span>
                </Link>
              )} />
            <List title="כרטיסים אדומים" icon={<RedCard className="w-4 h-4" />} data={redPlayers} tKey="red" empty="אין"
              render={(p, i) => <PlayerRow key={p.id} player={p} index={i} value={p.red_cards} color="bg-red-500" />} />
          </div>
        )}

        {activeTab === "referees" && (
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white"><Whistle className="w-4 h-4 text-purple-500" /> שופטים</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-700 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="text-right py-3 px-4 font-semibold">שופט</th>
                    <th className="text-center py-3 px-4 font-semibold">בוצעו</th>
                    <th className="text-center py-3 px-4 font-semibold">מתוכננים</th>
                    <th className="text-center py-3 px-4 font-semibold">סה״כ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {refStats.map((ref, i) => (
                    <tr key={`${ref.type}-${ref.id}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <span className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold ${medal(i)}`}>{i + 1}</span>
                          <div>
                            <p className="font-semibold text-sm text-slate-900 dark:text-white">{ref.first_name} {ref.last_name}</p>
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${ref.type === 'player' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300'}`}>
                              {ref.type === 'player' ? 'שחקן-שופט' : 'חיצוני'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="text-center py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">{ref.completed}</td>
                      <td className="text-center py-3 px-4 text-slate-500 dark:text-slate-400">{ref.scheduled}</td>
                      <td className="text-center py-3 px-4">
                        <span className="bg-purple-500 text-white text-xs font-bold px-2.5 py-1 rounded-md">{ref.total}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {refStats.length === 0 && <p className="text-center text-slate-400 py-8 text-sm">אין נתוני שיפוט</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
