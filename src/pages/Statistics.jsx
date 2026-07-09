import { useState, useEffect } from "react"
import { getTeams, getPlayers, getGames, getReferees } from "@/lib/api"
import { BarChart3, Target, Flame, Shield, Award, Crown, ChevronDown, ChevronUp, Gavel, RefreshCw } from "lucide-react"
import { motion } from "framer-motion"
import TeamLogo from "@/components/TeamLogo"

export default function Statistics() {
  const [teams, setTeams] = useState([])
  const [players, setPlayers] = useState([])
  const [games, setGames] = useState([])
  const [referees, setReferees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState("scorers")
  const [expanded, setExpanded] = useState({})

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      setLoading(true); setError(null)
      const [t, p, g, r] = await Promise.all([getTeams(), getPlayers(), getGames(), getReferees()])
      setTeams(t); setPlayers(p); setGames(g); setReferees(r)
    } catch (err) { console.error(err); setError("שגיאה בטעינת הנתונים") }
    finally { setLoading(false) }
  }

  const toggle = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))
  const teamName = (id) => teams.find(t => t.id === id)?.name || '—'

  const done = games.filter(g => g.status === 'completed')
  const totalGoals = teams.reduce((s, t) => s + (t.goals_for || 0), 0)
  const avgGoals = done.length > 0 ? (totalGoals / done.length).toFixed(1) : 0
  const maxGoals = done.length > 0 ? Math.max(...done.map(g => (g.home_score || 0) + (g.away_score || 0))) : 0

  const topScorers = players.filter(p => p.position === 'Field Player').sort((a, b) => (b.goals || 0) - (a.goals || 0))

  const topPerTeam = teams.map(team => {
    const best = players.filter(p => p.team_id === team.id && p.position === 'Field Player')
      .reduce((b, p) => (p.goals || 0) > (b?.goals || 0) ? p : b, null)
    return best ? { ...best, team } : null
  }).filter(Boolean).sort((a, b) => (b.goals || 0) - (a.goals || 0))

  const goalkeepers = players.filter(p => p.position === 'Goalkeeper').map(gk => {
    const tg = done.filter(g => g.home_team_id === gk.team_id || g.away_team_id === gk.team_id)
    const cs = tg.filter(g => (g.home_team_id === gk.team_id ? g.away_score : g.home_score) === 0).length
    return { ...gk, clean_sheets: cs, total_games: tg.length }
  }).sort((a, b) => b.clean_sheets - a.clean_sheets)

  const bluePlayers = players.filter(p => (p.blue_cards || 0) > 0).sort((a, b) => b.blue_cards - a.blue_cards)
  const redPlayers = players.filter(p => (p.red_cards || 0) > 0).sort((a, b) => b.red_cards - a.red_cards)
  const blueTeams = teams.map(t => ({ ...t, total_blue: players.filter(p => p.team_id === t.id).reduce((s, p) => s + (p.blue_cards || 0), 0) })).filter(t => t.total_blue > 0).sort((a, b) => b.total_blue - a.total_blue)

  const refStats = (() => {
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
  })()

  const tabs = [
    { id: "scorers", label: "מבקיעים", icon: Flame },
    { id: "goalkeepers", label: "שוערים", icon: Shield },
    { id: "cards", label: "כרטיסים", icon: Award },
    { id: "referees", label: "שופטים", icon: Gavel },
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
    <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
      <div className="flex items-center gap-2.5">
        <span className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold ${medal(index)}`}>{index + 1}</span>
        <div>
          <p className="font-semibold text-sm text-slate-900 dark:text-white">{player.first_name} {player.last_name}</p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">{teamName(player.team_id)}</p>
        </div>
      </div>
      <span className={`${color} text-white text-xs font-bold px-2.5 py-1 rounded-md`}>{value}</span>
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

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-5">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="page-title flex items-center gap-2.5">
          <BarChart3 className="w-7 h-7 text-orange-500" /> סטטיסטיקות
        </h1>
        <p className="page-subtitle mt-1">נתוני ביצועים עונת 2025-26</p>
      </motion.div>

      {/* Overview cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4 text-center">
          <p className="text-3xl font-extrabold text-slate-900 dark:text-white">{done.length}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">משחקים</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-extrabold text-orange-500">{totalGoals}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">שערים</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-extrabold text-slate-900 dark:text-white">{avgGoals}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">ממוצע / משחק</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={activeTab === tab.id ? "tab-active" : "tab-inactive"}>
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* Scorers */}
      {activeTab === "scorers" && (
        <div className="space-y-4">
          <List title="מלכי השערים" icon={<Flame className="w-4 h-4 text-red-500" />} data={topScorers} tKey="top" empty="אין נתונים"
            render={(p, i) => <PlayerRow key={p.id} player={p} index={i} value={`${p.goals || 0} שערים`} />} />
          <List title="מצטיין מכל קבוצה" icon={<Crown className="w-4 h-4 text-amber-500" />} data={topPerTeam} tKey="perTeam" empty="אין נתונים"
            render={(p, i) => <PlayerRow key={p.id} player={p} index={i} value={`${p.goals || 0}`} color="bg-amber-500" />} />
        </div>
      )}

      {/* Goalkeepers */}
      {activeTab === "goalkeepers" && (
        <List title="שוערי הברזל" icon={<Shield className="w-4 h-4 text-blue-500" />} data={goalkeepers} tKey="gk" empty="אין שוערים"
          render={(gk, i) => (
            <div key={gk.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2.5">
                <span className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold ${medal(i)}`}>{i + 1}</span>
                <div>
                  <p className="font-semibold text-sm text-slate-900 dark:text-white">{gk.first_name} {gk.last_name}</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">{teamName(gk.team_id)} • {gk.total_games} משחקים</p>
                </div>
              </div>
              <span className="bg-blue-500 text-white text-xs font-bold px-2.5 py-1 rounded-md">{gk.clean_sheets} נקיות</span>
            </div>
          )} />
      )}

      {/* Cards */}
      {activeTab === "cards" && (
        <div className="space-y-4">
          <List title="כרטיסים כחולים" icon={<Award className="w-4 h-4 text-blue-500" />} data={bluePlayers} tKey="blue" empty="אין"
            render={(p, i) => <PlayerRow key={p.id} player={p} index={i} value={p.blue_cards} color="bg-blue-500" />} />
          <List title="כחולים לפי קבוצה" icon={<Shield className="w-4 h-4 text-blue-500" />} data={blueTeams} tKey="blueT" empty="אין"
            render={(t, i) => (
              <div key={t.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-center gap-2.5">
                  <TeamLogo team={t} size={6} />
                  <span className="font-semibold text-sm text-slate-900 dark:text-white">{t.name}</span>
                </div>
                <span className="bg-blue-500 text-white text-xs font-bold px-2.5 py-1 rounded-md">{t.total_blue}</span>
              </div>
            )} />
          <List title="כרטיסים אדומים" icon={<Award className="w-4 h-4 text-red-500" />} data={redPlayers} tKey="red" empty="אין"
            render={(p, i) => <PlayerRow key={p.id} player={p} index={i} value={p.red_cards} color="bg-red-500" />} />
        </div>
      )}

      {/* Referees */}
      {activeTab === "referees" && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
            <h3 className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white"><Gavel className="w-4 h-4 text-purple-500" /> שופטים</h3>
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
  )
}
