import { useState, useEffect } from "react"
import { getTeams, getPlayers, getGames, getReferees } from "@/lib/api"
import { BarChart3, Trophy, Target, Flame, Shield, Award, Calendar, Crown, ChevronDown, ChevronUp, Gavel } from "lucide-react"
import { motion } from "framer-motion"

export default function Statistics() {
  const [teams, setTeams] = useState([])
  const [players, setPlayers] = useState([])
  const [games, setGames] = useState([])
  const [referees, setReferees] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("goals")
  const [expanded, setExpanded] = useState({})

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [t, p, g, r] = await Promise.all([getTeams(), getPlayers(), getGames(), getReferees()])
      setTeams(t); setPlayers(p); setGames(g); setReferees(r)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const toggle = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))
  const getTeamName = (id) => teams.find(t => t.id === id)?.name || 'לא ידוע'
  const getTeamColor = (id) => teams.find(t => t.id === id)?.primary_color || '#f97316'

  const completedGames = games.filter(g => g.status === 'completed')
  const totalGoals = teams.reduce((sum, t) => sum + (t.goals_for || 0), 0)
  const avgGoals = completedGames.length > 0 ? (totalGoals / completedGames.length).toFixed(1) : 0

  const topScorers = players.filter(p => p.position === 'Field Player').sort((a, b) => (b.goals || 0) - (a.goals || 0))

  const topScorerPerTeam = teams.map(team => {
    const best = players.filter(p => p.team_id === team.id && p.position === 'Field Player')
      .reduce((best, p) => (p.goals || 0) > (best?.goals || 0) ? p : best, null)
    return best ? { ...best, team } : null
  }).filter(Boolean).sort((a, b) => (b.goals || 0) - (a.goals || 0))

  const goalkeepers = players.filter(p => p.position === 'Goalkeeper').map(gk => {
    const teamGames = completedGames.filter(g => g.home_team_id === gk.team_id || g.away_team_id === gk.team_id)
    const cleanSheets = teamGames.filter(g => {
      const oppScore = g.home_team_id === gk.team_id ? (g.away_score || 0) : (g.home_score || 0)
      return oppScore === 0
    }).length
    return { ...gk, clean_sheets: cleanSheets, total_games: teamGames.length }
  }).sort((a, b) => b.clean_sheets - a.clean_sheets)

  const blueCardsPlayers = players.filter(p => (p.blue_cards || 0) > 0).sort((a, b) => b.blue_cards - a.blue_cards)
  const redCardsPlayers = players.filter(p => (p.red_cards || 0) > 0).sort((a, b) => b.red_cards - a.red_cards)

  const blueCardsTeams = teams.map(t => ({
    ...t,
    total_blue: players.filter(p => p.team_id === t.id).reduce((s, p) => s + (p.blue_cards || 0), 0)
  })).filter(t => t.total_blue > 0).sort((a, b) => b.total_blue - a.total_blue)

  const outstandingReferees = (() => {
    const relevant = games.filter(g => g.referee_id && ['completed', 'scheduled'].includes(g.status))
    const map = new Map()
    relevant.forEach(g => {
      const key = `${g.referee_type}-${g.referee_id}`
      if (!map.has(key)) {
        let ref = g.referee_type === 'player' ? players.find(p => p.id === g.referee_id) : referees.find(r => r.id === g.referee_id)
        if (ref) map.set(key, { ...ref, type: g.referee_type, completed: 0, scheduled: 0, total: 0 })
      }
      if (map.has(key)) {
        const r = map.get(key)
        if (g.status === 'completed') r.completed++
        else r.scheduled++
        r.total++
      }
    })
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  })()

  const tabs = [
    { id: "goals", label: "שערים", icon: Target },
    { id: "scorers", label: "מבקיעים", icon: Flame },
    { id: "goalkeepers", label: "שוערים", icon: Shield },
    { id: "cards", label: "כרטיסים", icon: Award },
    { id: "referees", label: "שופטים", icon: Gavel },
  ]

  const ExpandableList = ({ title, icon, data, renderItem, tableKey, emptyMsg }) => {
    const isExpanded = expanded[tableKey]
    const display = isExpanded ? data : data.slice(0, 5)
    return (
      <div className="bg-white/60 backdrop-blur-sm border border-slate-200/60 rounded-xl overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-slate-200/60">
          <h3 className="flex items-center gap-2 font-semibold">{icon} {title}</h3>
        </div>
        <div className="p-4 sm:p-6 space-y-3">
          {display.map((item, i) => renderItem(item, i))}
          {data.length === 0 && <p className="text-center text-slate-500 py-6">{emptyMsg}</p>}
          {data.length > 5 && (
            <div className="flex justify-center pt-2">
              <button onClick={() => toggle(tableKey)} className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 px-4 py-2 border border-slate-200 rounded-lg">
                {isExpanded ? <><ChevronUp className="w-4 h-4" /> הצג פחות</> : <><ChevronDown className="w-4 h-4" /> הצג הכל ({data.length})</>}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  const PlayerRow = ({ player, index, badge, badgeColor = "bg-red-600" }) => (
    <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50/60">
      <div className="flex items-center gap-3">
        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
          index === 0 ? 'bg-yellow-100 text-yellow-800' :
          index === 1 ? 'bg-slate-200 text-slate-700' :
          index === 2 ? 'bg-orange-100 text-orange-800' :
          'bg-slate-100 text-slate-600'
        }`}>{index + 1}</span>
        <div>
          <p className="font-semibold text-sm">{player.first_name} {player.last_name}</p>
          <p className="text-xs text-slate-500">{getTeamName(player.team_id)}</p>
        </div>
      </div>
      <span className={`${badgeColor} text-white text-xs font-bold px-2 py-1 rounded-full`}>{badge}</span>
    </div>
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-orange-600 mx-auto" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-orange-600" />
            <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-slate-900 via-orange-800 to-slate-900 bg-clip-text text-transparent">
              סטטיסטיקות
            </h1>
          </div>
        </motion.div>

        {/* Overview */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-xl p-4">
            <p className="text-green-600 font-medium text-xs">משחקים הושלמו</p>
            <p className="text-3xl font-bold text-green-900">{completedGames.length}</p>
          </div>
          <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-xl p-4">
            <p className="text-orange-600 font-medium text-xs">ממוצע שערים למשחק</p>
            <p className="text-3xl font-bold text-orange-900">{avgGoals}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-white/60 backdrop-blur-sm rounded-lg p-1 border border-slate-200/60 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 py-2 px-3 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id ? "bg-white shadow-sm text-slate-900" : "text-slate-600"
              }`}
            >
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>

        {/* Goals Tab */}
        {activeTab === "goals" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-xl p-6 text-center">
                <Target className="w-8 h-8 text-orange-500 mx-auto mb-2" />
                <div className="text-4xl font-bold text-orange-900">{totalGoals}</div>
                <p className="text-orange-600 text-sm">סך כל השערים</p>
              </div>
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-6 text-center">
                <BarChart3 className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                <div className="text-4xl font-bold text-blue-900">{avgGoals}</div>
                <p className="text-blue-600 text-sm">ממוצע למשחק</p>
              </div>
            </div>
            <div className="bg-white/60 border border-slate-200/60 rounded-xl p-6">
              <h3 className="font-semibold mb-4">שער הגבוה ביותר במשחק</h3>
              <div className="text-3xl font-bold text-slate-900">
                {completedGames.length > 0 ? Math.max(...completedGames.map(g => (g.home_score || 0) + (g.away_score || 0))) : 0}
              </div>
            </div>
          </div>
        )}

        {/* Scorers Tab */}
        {activeTab === "scorers" && (
          <div className="space-y-6">
            <ExpandableList
              title="מלכי השערים" icon={<Flame className="w-5 h-5 text-red-500" />}
              data={topScorers} tableKey="topScorers" emptyMsg="אין נתונים"
              renderItem={(p, i) => <PlayerRow key={p.id} player={p} index={i} badge={`${p.goals || 0} שערים`} />}
            />
            <ExpandableList
              title="מבקיע מצטיין מכל קבוצה" icon={<Crown className="w-5 h-5 text-orange-500" />}
              data={topScorerPerTeam} tableKey="perTeam" emptyMsg="אין נתונים"
              renderItem={(p, i) => <PlayerRow key={p.id} player={p} index={i} badge={`${p.goals || 0}`} badgeColor="bg-orange-600" />}
            />
          </div>
        )}

        {/* Goalkeepers Tab */}
        {activeTab === "goalkeepers" && (
          <ExpandableList
            title="שוערי הברזל" icon={<Shield className="w-5 h-5 text-blue-500" />}
            data={goalkeepers} tableKey="goalkeepers" emptyMsg="אין שוערים"
            renderItem={(gk, i) => (
              <div key={gk.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50/60">
                <div className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    i === 0 ? 'bg-yellow-100 text-yellow-800' : i === 1 ? 'bg-slate-200 text-slate-700' : i === 2 ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-600'
                  }`}>{i + 1}</span>
                  <div>
                    <p className="font-semibold text-sm">{gk.first_name} {gk.last_name}</p>
                    <p className="text-xs text-slate-500">{getTeamName(gk.team_id)}</p>
                  </div>
                </div>
                <div className="text-left">
                  <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-full">{gk.clean_sheets} נקיות</span>
                  <p className="text-xs text-slate-500 mt-1">{gk.total_games} משחקים</p>
                </div>
              </div>
            )}
          />
        )}

        {/* Cards Tab */}
        {activeTab === "cards" && (
          <div className="space-y-6">
            <ExpandableList
              title="כרטיסים כחולים - שחקנים" icon={<Award className="w-5 h-5 text-blue-500" />}
              data={blueCardsPlayers} tableKey="bluePlayers" emptyMsg="אין כרטיסים כחולים"
              renderItem={(p, i) => <PlayerRow key={p.id} player={p} index={i} badge={p.blue_cards} badgeColor="bg-blue-600" />}
            />
            <ExpandableList
              title="כרטיסים כחולים - קבוצות" icon={<Trophy className="w-5 h-5 text-blue-500" />}
              data={blueCardsTeams} tableKey="blueTeams" emptyMsg="אין כרטיסים"
              renderItem={(t, i) => (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-lg bg-blue-50/60">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full" style={{ backgroundColor: t.primary_color || '#f97316' }} />
                    <span className="font-semibold text-sm">{t.name}</span>
                  </div>
                  <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-full">{t.total_blue}</span>
                </div>
              )}
            />
            <ExpandableList
              title="כרטיסים אדומים" icon={<Award className="w-5 h-5 text-red-500" />}
              data={redCardsPlayers} tableKey="redPlayers" emptyMsg="אין כרטיסים אדומים"
              renderItem={(p, i) => <PlayerRow key={p.id} player={p} index={i} badge={p.red_cards} badgeColor="bg-red-600" />}
            />
          </div>
        )}

        {/* Referees Tab */}
        {activeTab === "referees" && (
          <div className="bg-white/60 border border-slate-200/60 rounded-xl overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-200/60">
              <h3 className="flex items-center gap-2 font-semibold"><Gavel className="w-5 h-5 text-purple-500" /> סטטיסטיקות שופטים</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60">
                    <th className="text-right py-3 px-4 font-semibold">שופט</th>
                    <th className="text-center py-3 px-4 font-semibold">מתוכננים</th>
                    <th className="text-center py-3 px-4 font-semibold">בוצעו</th>
                    <th className="text-center py-3 px-4 font-semibold">סה״כ</th>
                  </tr>
                </thead>
                <tbody>
                  {outstandingReferees.map((ref, i) => (
                    <tr key={`${ref.type}-${ref.id}`} className="border-b border-slate-100 hover:bg-slate-50/60">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            i === 0 ? 'bg-yellow-100 text-yellow-800' : 'bg-slate-100 text-slate-600'
                          }`}>{i + 1}</span>
                          <div>
                            <p className="font-semibold text-sm">{ref.first_name} {ref.last_name}</p>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${ref.type === 'player' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'}`}>
                              {ref.type === 'player' ? 'שחקן-שופט' : 'שופט חיצוני'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="text-center py-3 px-4">
                        {ref.scheduled > 0 ? <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">{ref.scheduled}</span> : <span className="text-slate-400">0</span>}
                      </td>
                      <td className="text-center py-3 px-4">
                        {ref.completed > 0 ? <span className="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full">{ref.completed}</span> : <span className="text-slate-400">0</span>}
                      </td>
                      <td className="text-center py-3 px-4">
                        <span className="bg-purple-100 text-purple-800 text-xs font-bold px-2 py-0.5 rounded-full">{ref.total}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {outstandingReferees.length === 0 && <p className="text-center text-slate-500 py-8">אין נתוני שיפוט</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
