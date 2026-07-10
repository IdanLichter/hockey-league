import { useState, useEffect } from "react"
import { useAuth } from "@/lib/AuthContext"
import { useNavigate } from "react-router-dom"
import {
  getTeams, getPlayers, getGames, getGameStats, getAdminUsers,
  createGame, updateGame, deleteGame,
  createPlayer, updatePlayer, deletePlayer,
  updateTeam,
  createGameStat, deleteGameStatsByGameId,
  addAdminUser, removeAdminUser,
  getGameStatsByGameId,
  recalculateTeamStats, recalculatePlayerStats,
  getLeagueSetting,
  archiveAndResetSeason, getArchivedSeasons
} from "@/lib/api"
import {
  Shield, Calendar, UserCheck, Users, Settings, LogOut, Trash2, Plus,
  Pencil, X, Check, Save, ChevronDown, UserPlus, Crown, Trophy,
  Archive, AlertTriangle, Image, Flag
} from "lucide-react"
import { motion } from "framer-motion"
import TeamLogo from "@/components/TeamLogo"
import { format } from "date-fns"
import { useSeasonMode } from "@/App"
import PosterGenerator from "@/components/PosterGenerator"
import ClaimsReview from "@/components/admin/ClaimsReview"
import SuggestionsReview from "@/components/admin/SuggestionsReview"
import RolesAdmin from "@/components/admin/RolesAdmin"
import ReportsReview from "@/components/admin/ReportsReview"
import WhatsNew from "@/components/admin/WhatsNew"
import ClustersAdmin from "@/components/admin/ClustersAdmin"
import { Award, Images } from "lucide-react"
import { BRAND_ORANGE } from '@/lib/brand'

const tabs = [
  { id: "games", label: "משחקים", icon: Calendar },
  { id: "players", label: "שחקנים", icon: UserCheck },
  { id: "teams", label: "קבוצות", icon: Users },
  { id: "season", label: "עונה", icon: Archive },
  { id: "claims", label: "בקשות", icon: UserPlus },
  { id: "reports", label: "דיווחים", icon: Flag },
  { id: "clusters", label: "קבוצות תמונות", icon: Images },
  { id: "roles", label: "תפקידים", icon: Award },
  { id: "users", label: "מנהלים", icon: Crown },
]

export default function Admin() {
  const { user, isAdmin, coachTeamIds, isJudgeRole, loading: authLoading, signOut } = useAuth()
  const navigate = useNavigate()
  // Each non-admin role unlocks a subset of tabs, and one person may hold
  // several (a coach who is also a judge sees games + players + claims).
  // Branch on isAdmin FIRST — an admin has coachTeamIds === [] but full access.
  const isCoach = coachTeamIds.length > 0
  const canManage = isAdmin || isCoach || isJudgeRole
  const coachScoped = !isAdmin && isCoach          // team-scope the players/claims tabs
  const scopedTabIds = new Set([
    ...(isCoach ? ["players", "claims"] : []),
    ...(isJudgeRole ? ["games"] : []),
  ])
  const visibleTabs = isAdmin ? tabs : tabs.filter(t => scopedTabIds.has(t.id))
  // A role-less user reaches AccessDenied below, but this runs first — so never
  // index into an empty array.
  const firstTabId = visibleTabs[0]?.id ?? tabs[0].id
  const [activeTab, setActiveTab] = useState(firstTabId)
  // Auth may still be loading when this mounts (e.g. the OAuth redirect lands on
  // /admin), so roles can arrive after the initial render. Derive the tab actually
  // shown: if the stored one isn't visible for this role, fall back to the first
  // visible one — keeps a coach off the (hidden) games tab and an admin on games.
  const currentTab = visibleTabs.some(t => t.id === activeTab) ? activeTab : firstTabId
  const [teams, setTeams] = useState([])
  const [players, setPlayers] = useState([])
  const [games, setGames] = useState([])
  const [gameStats, setGameStats] = useState([])
  const [adminUsers, setAdminUsers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!authLoading && (!user || !canManage)) return
    loadData()
  }, [authLoading, user, isAdmin, coachTeamIds.length, isJudgeRole])

  const loadData = async () => {
    try {
      const [t, p, g, gs, au] = await Promise.all([
        getTeams(), getPlayers(), getGames(), getGameStats(),
        getAdminUsers().catch(() => [])
      ])
      setTeams(t); setPlayers(p); setGames(g); setGameStats(gs); setAdminUsers(au)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-orange-500 border-t-transparent" />
      </div>
    )
  }

  if (!user || !canManage) {
    return <AccessDenied />
  }

  const teamsMap = Object.fromEntries(teams.map(t => [t.id, t]))

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-5">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title flex items-center gap-2.5">
              <Shield className="w-7 h-7 text-orange-500" /> ניהול
            </h1>
            <p className="page-subtitle mt-1">מחובר כ-{user.email}</p>
          </div>
          <button onClick={() => { signOut(); navigate('/') }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
            <LogOut className="w-4 h-4" /> התנתק
          </button>
        </div>
      </motion.div>

      {/* Side-nav layout: vertical rail (right in RTL) on desktop, scrollable row on mobile */}
      <div className="lg:grid lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-6 lg:items-start">
        <aside className="lg:sticky lg:top-20 self-start mb-4 lg:mb-0">
          <nav className="card p-2 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {visibleTabs.map(tab => {
              const active = currentTab === tab.id
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap shrink-0 lg:w-full ${
                    active
                      ? "bg-orange-500 text-white shadow-sm shadow-orange-500/25"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                  }`}>
                  <tab.icon className="w-4 h-4 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </nav>
        </aside>

        <div className="min-w-0">
          {loading ? (
            <div className="flex items-center justify-center min-h-[200px]">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-orange-500 border-t-transparent" />
            </div>
          ) : (
            <>
              {currentTab === "games" && <GamesAdmin games={games} teams={teams} players={players} teamsMap={teamsMap} gameStats={gameStats} reload={loadData} />}
              {currentTab === "players" && <PlayersAdmin players={players} teams={teams} teamsMap={teamsMap} reload={loadData} coachTeamIds={coachScoped ? coachTeamIds : null} />}
              {currentTab === "teams" && <TeamsAdmin teams={teams} reload={loadData} />}
              {currentTab === "season" && <SeasonAdmin games={games} teams={teams} players={players} reload={loadData} />}
              {currentTab === "claims" && <><ClaimsReview teamsMap={teamsMap} coachTeamIds={coachScoped ? coachTeamIds : null} />{isAdmin && <SuggestionsReview players={players} />}</>}
              {currentTab === "reports" && <ReportsReview />}
              {currentTab === "clusters" && <ClustersAdmin players={players} />}
              {currentTab === "roles" && <RolesAdmin teamsMap={teamsMap} players={players} />}
              {currentTab === "users" && <UsersAdmin adminUsers={adminUsers} currentUserEmail={user.email} reload={loadData} />}
            </>
          )}
        </div>
      </div>

      <WhatsNew />
    </div>
  )
}

function AccessDenied() {
  const { signInWithGoogle, user } = useAuth()
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="card p-8 sm:p-12 text-center max-w-md mx-4">
        <Shield className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">גישת מנהלים</h2>
        {user ? (
          <>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              החשבון {user.email} אינו מורשה לגשת לדף הניהול.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              התחבר עם חשבון Google מורשה כדי לגשת לדף הניהול.
            </p>
            <button onClick={signInWithGoogle}
              className="flex items-center justify-center gap-3 w-full px-6 py-3 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-300 hover:border-orange-500 hover:shadow-md transition-all">
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              התחבר עם Google
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ============ GAMES ADMIN ============
function GamesAdmin({ games, teams, players, teamsMap, gameStats, reload }) {
  const [showForm, setShowForm] = useState(false)
  const [editingGame, setEditingGame] = useState(null)
  const [editingStats, setEditingStats] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showPosterModal, setShowPosterModal] = useState(false)
  const [form, setForm] = useState({
    home_team_id: '', away_team_id: '', game_date: '', venue: '',
    home_score: '', away_score: '', status: 'scheduled',
    game_type: 'ליגה', playoff_round: '', series_game: '', notes: '',
    referee_id: '', referee_type: 'player'
  })
  const [refFilter, setRefFilter] = useState('all')

  const refereeOptions = players.filter(p => p.is_referee)

  const resetForm = () => {
    setForm({
      home_team_id: '', away_team_id: '', game_date: '', venue: '',
      home_score: '', away_score: '', status: 'scheduled',
      game_type: 'ליגה', playoff_round: '', series_game: '', notes: '',
      referee_id: '', referee_type: 'player'
    })
    setEditingGame(null)
    setShowForm(false)
  }

  const startEdit = (game) => {
    setForm({
      home_team_id: game.home_team_id || '',
      away_team_id: game.away_team_id || '',
      game_date: game.game_date ? format(new Date(game.game_date), "yyyy-MM-dd'T'HH:mm") : '',
      venue: game.venue || '',
      home_score: game.home_score ?? '',
      away_score: game.away_score ?? '',
      status: game.status || 'scheduled',
      game_type: game.game_type || 'ליגה',
      playoff_round: game.playoff_round || '',
      series_game: game.series_game ?? '',
      notes: game.notes || '',
      referee_id: game.referee_id || '',
      referee_type: game.referee_type || 'player'
    })
    setEditingGame(game.id)
    setShowForm(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {
        ...form,
        home_score: form.home_score !== '' ? Number(form.home_score) : null,
        away_score: form.away_score !== '' ? Number(form.away_score) : null,
        series_game: form.series_game !== '' ? Number(form.series_game) : null,
        playoff_round: form.playoff_round || null,
        referee_id: form.referee_id || null,
        referee_type: form.referee_id ? form.referee_type : null,
      }
      if (editingGame) {
        await updateGame(editingGame, payload)
      } else {
        await createGame(payload)
      }
      // Recalculate team standings after game change
      await recalculateTeamStats()
      resetForm()
      await reload()
    } catch (err) { alert('שגיאה: ' + err.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!confirm('למחוק את המשחק?')) return
    try {
      await deleteGame(id)
      await recalculateTeamStats()
      // player-stat recalculation is disabled until the historical game_stats backfill is complete (Package 2)
      await reload()
    } catch (err) { alert('שגיאה: ' + err.message) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-sm text-slate-900 dark:text-white">
          {games.length} משחקים
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPosterModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white text-sm font-semibold rounded-xl hover:bg-purple-600 transition-colors">
            <Image className="w-4 h-4" /> פוסטר
          </button>
          <button onClick={() => { resetForm(); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-xl hover:bg-orange-600 transition-colors">
            <Plus className="w-4 h-4" /> משחק חדש
          </button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              {editingGame ? 'עריכת משחק' : 'משחק חדש'}
            </h3>
            <button onClick={resetForm} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">קבוצת בית</label>
              <select value={form.home_team_id} onChange={e => setForm({ ...form, home_team_id: e.target.value })} className="filter-select w-full">
                <option value="">בחר קבוצה</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">קבוצת חוץ</label>
              <select value={form.away_team_id} onChange={e => setForm({ ...form, away_team_id: e.target.value })} className="filter-select w-full">
                <option value="">בחר קבוצה</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">תאריך ושעה</label>
              <input type="datetime-local" value={form.game_date} onChange={e => setForm({ ...form, game_date: e.target.value })} className="filter-input w-full" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">מגרש</label>
              <input type="text" value={form.venue} onChange={e => setForm({ ...form, venue: e.target.value })} className="filter-input w-full" placeholder="מגרש" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">תוצאת בית</label>
              <input type="number" min="0" value={form.home_score} onChange={e => setForm({ ...form, home_score: e.target.value })} className="filter-input w-full" placeholder="—" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">תוצאת חוץ</label>
              <input type="number" min="0" value={form.away_score} onChange={e => setForm({ ...form, away_score: e.target.value })} className="filter-input w-full" placeholder="—" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">סטטוס</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="filter-select w-full">
                <option value="scheduled">מתוכנן</option>
                <option value="waiting_result">ממתין לתוצאה</option>
                <option value="in_progress">בתהליך</option>
                <option value="completed">הסתיים</option>
                <option value="postponed">נדחה</option>
                <option value="cancelled">בוטל</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">סוג משחק</label>
              <select value={form.game_type} onChange={e => setForm({ ...form, game_type: e.target.value })} className="filter-select w-full">
                <option value="ליגה">ליגה</option>
                <option value="פלייאוף">פלייאוף</option>
                <option value="Final Four">Final Four</option>
              </select>
            </div>
            {form.game_type !== 'ליגה' && (
              <>
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">שלב</label>
                  <select value={form.playoff_round} onChange={e => setForm({ ...form, playoff_round: e.target.value })} className="filter-select w-full">
                    <option value="">—</option>
                    <option value="first_round">סיבוב ראשון</option>
                    <option value="semi_final">חצי גמר</option>
                    <option value="final">גמר</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">מספר משחק בסדרה</label>
                  <input type="number" min="1" value={form.series_game} onChange={e => setForm({ ...form, series_game: e.target.value })} className="filter-input w-full" />
                </div>
              </>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">שופט</label>
              <select value={form.referee_id} onChange={e => setForm({ ...form, referee_id: e.target.value })} className="filter-select w-full">
                <option value="">ללא שופט</option>
                {refereeOptions.map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">הערות</label>
              <input type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="filter-input w-full" placeholder="הערות..." />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handleSave} disabled={saving || !form.home_team_id || !form.away_team_id || !form.game_date}
              className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white text-sm font-semibold rounded-xl hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <Save className="w-4 h-4" /> {saving ? 'שומר...' : editingGame ? 'עדכן' : 'צור'}
            </button>
            <button onClick={resetForm} className="px-4 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
              ביטול
            </button>
          </div>
        </motion.div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setRefFilter('all')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${refFilter === 'all' ? 'bg-orange-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
          הכל ({games.length})
        </button>
        <button onClick={() => setRefFilter('missing')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 ${refFilter === 'missing' ? 'bg-amber-500 text-white' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30'}`}>
          <AlertTriangle className="w-3 h-3" /> ללא שופט ({games.filter(g => !g.referee_id && g.status === 'completed').length})
        </button>
      </div>

      {/* Games List */}
      <div className="card overflow-hidden">
        <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
          {games.filter(g => refFilter === 'all' || (!g.referee_id && g.status === 'completed')).sort((a, b) => new Date(b.game_date) - new Date(a.game_date)).map(game => (
            <div key={game.id}>
              <div className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <TeamLogo team={teamsMap[game.home_team_id]} size={7} />
                    <span className="font-semibold text-xs text-slate-900 dark:text-white truncate max-w-[80px] sm:max-w-none">{teamsMap[game.home_team_id]?.name}</span>
                  </div>
                  {/* RTL: away first, home last so each score renders beside its team (home is on the right). */}
                  <div className="text-center px-2">
                    {game.status === 'completed' ? (
                      <span className="font-bold text-sm text-slate-900 dark:text-white tabular-nums">{game.away_score} : {game.home_score}</span>
                    ) : (
                      <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-md">
                        {game.status === 'scheduled' ? 'מתוכנן' : game.status === 'postponed' ? 'נדחה' : game.status}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-slate-900 dark:text-white truncate max-w-[80px] sm:max-w-none">{teamsMap[game.away_team_id]?.name}</span>
                    <TeamLogo team={teamsMap[game.away_team_id]} size={7} />
                  </div>
                </div>
                <div className="flex items-center gap-2 mr-3">
                  {!game.referee_id && game.status === 'completed' && (
                    <span title="חסר שופט" className="text-amber-500"><AlertTriangle className="w-3.5 h-3.5" /></span>
                  )}
                  <span className="text-[10px] text-slate-400 hidden sm:inline">{format(new Date(game.game_date), "d/M/yy")}</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">{game.game_type}</span>
                  <button onClick={() => setEditingStats(editingStats === game.id ? null : game.id)}
                    className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-500 transition-colors" title="סטטיסטיקות">
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => startEdit(game)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(game.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {editingStats === game.id && (
                <GameStatsEditor
                  game={game}
                  players={players}
                  teamsMap={teamsMap}
                  existingStats={gameStats.filter(s => s.game_id === game.id)}
                  reload={reload}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {showPosterModal && (
        <PosterGenerator
          games={games}
          teams={teams}
          teamsMap={teamsMap}
          onClose={() => setShowPosterModal(false)}
        />
      )}
    </div>
  )
}

// ============ GAME STATS EDITOR ============
function GameStatsEditor({ game, players, teamsMap, existingStats, reload }) {
  const [stats, setStats] = useState([])
  const [saving, setSaving] = useState(false)

  const homePlayers = players.filter(p => p.team_id === game.home_team_id)
  const awayPlayers = players.filter(p => p.team_id === game.away_team_id)

  useEffect(() => {
    if (existingStats.length > 0) {
      setStats(existingStats.map(s => ({ ...s })))
    }
  }, [existingStats])

  const addStat = () => {
    setStats([...stats, {
      id: 'new-' + Date.now(),
      game_id: game.id,
      player_id: '',
      goals: 0,
      blue_cards: 0,
      red_cards: 0,
      clean_sheet: false,
      is_guest_player: false,
      guest_player_name: '',
      guest_player_original_team: '',
      guest_player_type: '',
    }])
  }

  const updateStat = (index, field, value) => {
    const updated = [...stats]
    updated[index] = { ...updated[index], [field]: value }
    setStats(updated)
  }

  const removeStat = (index) => {
    setStats(stats.filter((_, i) => i !== index))
  }

  const handleSaveStats = async () => {
    setSaving(true)
    try {
      // Delete all existing stats for this game
      await deleteGameStatsByGameId(game.id)
      // Insert new ones
      for (const stat of stats) {
        if (!stat.player_id && !stat.is_guest_player) continue
        const isGuest = !!stat.is_guest_player
        await createGameStat({
          game_id: game.id,
          player_id: isGuest ? null : (stat.player_id || null),
          goals: Number(stat.goals) || 0,
          blue_cards: Number(stat.blue_cards) || 0,
          red_cards: Number(stat.red_cards) || 0,
          clean_sheet: !!stat.clean_sheet,
          is_guest_player: isGuest,
          guest_player_name: isGuest ? String(stat.guest_player_name || '') : '',
          guest_player_original_team: isGuest ? String(stat.guest_player_original_team || '') : '',
          guest_player_type: isGuest && stat.guest_player_type ? String(stat.guest_player_type) : null,
        })
      }
      // player-stat recalculation is disabled until the historical game_stats backfill is complete (Package 2)
      await reload()
    } catch (err) { alert('שגיאה: ' + err.message) }
    finally { setSaving(false) }
  }

  const allPlayers = [...homePlayers, ...awayPlayers]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="px-4 pb-4 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-700">
      <div className="pt-3 pb-2 flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">סטטיסטיקות שחקנים</h4>
        <button onClick={addStat} className="flex items-center gap-1 text-xs font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700">
          <Plus className="w-3 h-3" /> הוסף שחקן
        </button>
      </div>

      <div className="space-y-2">
        {stats.map((stat, i) => (
          <div key={stat.id || i} className="bg-white dark:bg-slate-800 rounded-lg p-2 space-y-2">
            {/* Player / guest selector row */}
            <div className="flex flex-wrap items-center gap-2">
              {stat.is_guest_player ? (
                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                  <input type="text" value={stat.guest_player_name || ''} placeholder="שם השחקן"
                    onChange={e => updateStat(i, 'guest_player_name', e.target.value)}
                    className="filter-input text-xs flex-1 min-w-[8rem]" />
                  <input type="text" value={stat.guest_player_original_team || ''} placeholder="קבוצת מקור"
                    onChange={e => updateStat(i, 'guest_player_original_team', e.target.value)}
                    className="filter-input text-xs flex-1 min-w-[8rem]" />
                  <select value={stat.guest_player_type || ''} onChange={e => updateStat(i, 'guest_player_type', e.target.value)}
                    className="filter-select text-xs min-w-[6rem]">
                    <option value="">סוג</option>
                    <option value="youth">נוער</option>
                    <option value="guest_goalkeeper">שוער אורח</option>
                  </select>
                </div>
              ) : (
                <select value={stat.player_id} onChange={e => updateStat(i, 'player_id', e.target.value)}
                  className="filter-select text-xs flex-1 min-w-[10rem]">
                  <option value="">בחר שחקן</option>
                  <optgroup label={teamsMap[game.home_team_id]?.name}>
                    {homePlayers.map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
                  </optgroup>
                  <optgroup label={teamsMap[game.away_team_id]?.name}>
                    {awayPlayers.map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
                  </optgroup>
                </select>
              )}
              <label className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 cursor-pointer whitespace-nowrap">
                <input type="checkbox" checked={!!stat.is_guest_player}
                  onChange={e => updateStat(i, 'is_guest_player', e.target.checked)} />
                שחקן אורח
              </label>
              <button onClick={() => removeStat(i)} className="p-1 text-slate-400 hover:text-red-500 mr-auto">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {/* Stat inputs row */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="flex items-center gap-1">
                <label className="text-[10px] text-slate-400">שערים</label>
                <input type="number" min="0" value={stat.goals} onChange={e => updateStat(i, 'goals', e.target.value)}
                  className="filter-input w-14 text-xs text-center" />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-[10px] text-slate-400">כחול</label>
                <input type="number" min="0" value={stat.blue_cards} onChange={e => updateStat(i, 'blue_cards', e.target.value)}
                  className="filter-input w-14 text-xs text-center" />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-[10px] text-slate-400">אדום</label>
                <input type="number" min="0" value={stat.red_cards} onChange={e => updateStat(i, 'red_cards', e.target.value)}
                  className="filter-input w-14 text-xs text-center" />
              </div>
              <label className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 cursor-pointer whitespace-nowrap">
                <input type="checkbox" checked={!!stat.clean_sheet}
                  onChange={e => updateStat(i, 'clean_sheet', e.target.checked)} />
                שער נקי
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3">
        <button onClick={handleSaveStats} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
          <Save className="w-3.5 h-3.5" /> {saving ? 'שומר...' : 'שמור סטטיסטיקות'}
        </button>
      </div>
    </motion.div>
  )
}

// ============ PLAYERS ADMIN ============
function PlayersAdmin({ players, teams, teamsMap, reload, coachTeamIds = null }) {
  // Non-admin coach: roster is filtered to their team(s) and the team field is
  // locked to their team. Cosmetic scoping only — the players RLS policies are
  // the real gate. Admins pass coachTeamIds={null} and see the unchanged UI.
  const coachScoped = Array.isArray(coachTeamIds) && coachTeamIds.length > 0
  const teamOptions = coachScoped ? teams.filter(t => coachTeamIds.includes(t.id)) : teams
  const lockedTeamId = coachScoped && teamOptions.length === 1 ? teamOptions[0].id : ''
  const [showForm, setShowForm] = useState(false)
  const [editingPlayer, setEditingPlayer] = useState(null)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [feedback, setFeedback] = useState(null) // { type: 'ok' | 'err', text } — makes save success/failure impossible to miss
  const [form, setForm] = useState({
    first_name: '', last_name: '', jersey_number: '', position: 'Field Player',
    team_id: lockedTeamId, is_referee: false, is_core: false, goals: 0, games_played: 0,
    blue_cards: 0, red_cards: 0
  })

  const resetForm = () => {
    setForm({
      first_name: '', last_name: '', jersey_number: '', position: 'Field Player',
      team_id: lockedTeamId, is_referee: false, is_core: false, goals: 0, games_played: 0,
      blue_cards: 0, red_cards: 0
    })
    setEditingPlayer(null)
    setShowForm(false)
  }

  const startEdit = (player) => {
    setForm({
      first_name: player.first_name || '',
      last_name: player.last_name || '',
      jersey_number: player.jersey_number ?? '',
      position: player.position || 'Field Player',
      team_id: player.team_id || '',
      is_referee: player.is_referee || false,
      is_core: player.is_core || false,
      goals: player.goals || 0,
      games_played: player.games_played || 0,
      blue_cards: player.blue_cards || 0,
      red_cards: player.red_cards || 0,
    })
    setEditingPlayer(player.id)
    setShowForm(true)
  }

  const handleSave = async () => {
    setSaving(true)
    setFeedback(null)
    const wasEditing = !!editingPlayer
    const savedName = `${form.first_name} ${form.last_name}`.trim()
    try {
      const payload = {
        ...form,
        jersey_number: form.jersey_number !== '' ? Number(form.jersey_number) : null,
        goals: Number(form.goals) || 0,
        games_played: Number(form.games_played) || 0,
        blue_cards: Number(form.blue_cards) || 0,
        red_cards: Number(form.red_cards) || 0,
      }
      if (editingPlayer) {
        await updatePlayer(editingPlayer, payload)
      } else {
        await createPlayer(payload)
      }
      resetForm()
      await reload()
      setFeedback({ type: 'ok', text: `✓ ${savedName} ${wasEditing ? 'עודכן/ה' : 'נוסף/ה לליגה'} בהצלחה` })
    } catch (err) {
      // Translate the common failure (RLS / wrong account) into an actionable Hebrew message
      // instead of a raw Postgres string that's easy to dismiss.
      const msg = String(err?.message || err)
      const permissionDenied = err?.code === '42501' || /row-level security|permission denied|not authorized|JWT/i.test(msg)
      setFeedback({
        type: 'err',
        text: permissionDenied
          ? 'השמירה נכשלה — בעיית הרשאות. ודא/י שאת/ה מחובר/ת עם חשבון המנהל (האימייל מוצג בראש דף הניהול) ולא עם חשבון אחר, ונסה/י שוב.'
          : `השמירה נכשלה: ${msg}`,
      })
    } finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!confirm('למחוק את השחקן?')) return
    try {
      await deletePlayer(id)
      await reload()
    } catch (err) { alert('שגיאה: ' + err.message) }
  }

  const filtered = players.filter(p =>
    (!coachScoped || coachTeamIds.includes(p.team_id)) &&
    (!searchTerm || `${p.first_name} ${p.last_name}`.includes(searchTerm))
  )

  return (
    <div className="space-y-4">
      {feedback && (
        <div className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold ${
          feedback.type === 'ok'
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
            : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
        }`}>
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="shrink-0 opacity-70 hover:opacity-100" aria-label="סגור">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <input type="text" placeholder="חיפוש שחקן..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          className="filter-input flex-1 max-w-xs" />
        <button onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-xl hover:bg-orange-600 transition-colors">
          <Plus className="w-4 h-4" /> שחקן חדש
        </button>
      </div>

      {showForm && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              {editingPlayer ? 'עריכת שחקן' : 'שחקן חדש'}
            </h3>
            <button onClick={resetForm} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">שם פרטי</label>
              <input type="text" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} className="filter-input w-full" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">שם משפחה</label>
              <input type="text" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} className="filter-input w-full" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">מספר חולצה</label>
              <input type="number" min="0" value={form.jersey_number} onChange={e => setForm({ ...form, jersey_number: e.target.value })} className="filter-input w-full" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">עמדה</label>
              <select value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} className="filter-select w-full">
                <option value="Field Player">שחקן שדה</option>
                <option value="Goalkeeper">שוער</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">קבוצה</label>
              <select value={form.team_id} onChange={e => setForm({ ...form, team_id: e.target.value })} className="filter-select w-full disabled:opacity-60 disabled:cursor-not-allowed" disabled={coachScoped && teamOptions.length === 1}>
                <option value="">בחר קבוצה</option>
                {teamOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-4 pt-5">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer">
                <input type="checkbox" checked={form.is_core} onChange={e => setForm({ ...form, is_core: e.target.checked })}
                  className="rounded border-slate-300 text-orange-500 focus:ring-orange-500" />
                שחקן ליבה
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer">
                <input type="checkbox" checked={form.is_referee} onChange={e => setForm({ ...form, is_referee: e.target.checked })}
                  className="rounded border-slate-300 text-orange-500 focus:ring-orange-500" />
                שופט
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">שערים</label>
              <input type="number" min="0" value={form.goals} onChange={e => setForm({ ...form, goals: e.target.value })} className="filter-input w-full" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">משחקים</label>
              <input type="number" min="0" value={form.games_played} onChange={e => setForm({ ...form, games_played: e.target.value })} className="filter-input w-full" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">כרטיסים כחולים</label>
              <input type="number" min="0" value={form.blue_cards} onChange={e => setForm({ ...form, blue_cards: e.target.value })} className="filter-input w-full" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">כרטיסים אדומים</label>
              <input type="number" min="0" value={form.red_cards} onChange={e => setForm({ ...form, red_cards: e.target.value })} className="filter-input w-full" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button onClick={handleSave} disabled={saving || !form.first_name || !form.last_name || !form.team_id}
              className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white text-sm font-semibold rounded-xl hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <Save className="w-4 h-4" /> {saving ? 'שומר...' : editingPlayer ? 'עדכן' : 'צור'}
            </button>
            <button onClick={resetForm} className="px-4 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
              ביטול
            </button>
            {(!form.first_name || !form.last_name || !form.team_id) && (
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                חסר: {[!form.first_name && 'שם פרטי', !form.last_name && 'שם משפחה', !form.team_id && 'קבוצה'].filter(Boolean).join(', ')}
              </span>
            )}
          </div>
        </motion.div>
      )}

      {/* Players List */}
      <div className="card overflow-hidden">
        <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
          {filtered.sort((a, b) => a.first_name.localeCompare(b.first_name)).map(player => (
            <div key={player.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <div className="flex items-center gap-3">
                <TeamLogo team={teamsMap[player.team_id]} size={7} />
                <div>
                  <span className="font-semibold text-sm text-slate-900 dark:text-white">{player.first_name} {player.last_name}</span>
                  {player.jersey_number && <span className="text-[10px] text-slate-400 font-mono mr-1.5">#{player.jersey_number}</span>}
                  <div className="flex gap-1 mt-0.5">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${player.position === 'Goalkeeper' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                      {player.position === 'Goalkeeper' ? 'GK' : 'FP'}
                    </span>
                    {player.is_core && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">C</span>}
                    {player.is_referee && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">R</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span>{player.goals || 0} שערים</span>
                  <span>{player.games_played || 0} מש׳</span>
                </div>
                <button onClick={() => startEdit(player)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDelete(player.id)}
                  className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============ TEAMS ADMIN ============
function TeamsAdmin({ teams, reload }) {
  const [editingTeam, setEditingTeam] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({})

  const startEdit = (team) => {
    setForm({
      name: team.name || '',
      city: team.city || '',
      wins: team.wins || 0,
      losses: team.losses || 0,
      ties: team.ties || 0,
      points: team.points || 0,
      goals_for: team.goals_for || 0,
      goals_against: team.goals_against || 0,
      own_goals_received: team.own_goals_received || 0,
      home_venue: team.home_venue || '',
      primary_color: team.primary_color || BRAND_ORANGE,
    })
    setEditingTeam(team.id)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateTeam(editingTeam, {
        ...form,
        wins: Number(form.wins) || 0,
        losses: Number(form.losses) || 0,
        ties: Number(form.ties) || 0,
        points: Number(form.points) || 0,
        goals_for: Number(form.goals_for) || 0,
        goals_against: Number(form.goals_against) || 0,
        own_goals_received: Number(form.own_goals_received) || 0,
      })
      setEditingTeam(null)
      await reload()
    } catch (err) { alert('שגיאה: ' + err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-3">
      {teams.sort((a, b) => (b.points || 0) - (a.points || 0)).map(team => (
        <div key={team.id} className="card overflow-hidden">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <TeamLogo team={team} size={10} />
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">{team.name}</h3>
                <p className="text-xs text-slate-500">{team.city} • {team.points} נקודות • {team.wins}נ {team.ties}ת {team.losses}ה</p>
              </div>
            </div>
            <button onClick={() => editingTeam === team.id ? setEditingTeam(null) : startEdit(team)}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors">
              {editingTeam === team.id ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
            </button>
          </div>

          {editingTeam === team.id && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="px-4 pb-4 border-t border-slate-100 dark:border-slate-700 pt-4 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">שם</label>
                  <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="filter-input w-full" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">עיר</label>
                  <input type="text" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className="filter-input w-full" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">מגרש בית</label>
                  <input type="text" value={form.home_venue} onChange={e => setForm({ ...form, home_venue: e.target.value })} className="filter-input w-full" />
                </div>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-7 gap-3">
                {[
                  { key: 'points', label: 'נקודות' },
                  { key: 'wins', label: 'נצחונות' },
                  { key: 'ties', label: 'תיקו' },
                  { key: 'losses', label: 'הפסדים' },
                  { key: 'goals_for', label: 'שערי זכות' },
                  { key: 'goals_against', label: 'שערי חובה' },
                  { key: 'own_goals_received', label: 'עצמיים' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1 block">{label}</label>
                    <input type="number" min="0" value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} className="filter-input w-full text-center" />
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={handleSave} disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-xs font-semibold rounded-xl hover:bg-orange-600 transition-colors disabled:opacity-50">
                  <Save className="w-3.5 h-3.5" /> {saving ? 'שומר...' : 'שמור'}
                </button>
                <button onClick={() => setEditingTeam(null)} className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors">
                  ביטול
                </button>
              </div>
            </motion.div>
          )}
        </div>
      ))}
    </div>
  )
}

// ============ ADMIN USERS ============
function UsersAdmin({ adminUsers, currentUserEmail, reload }) {
  const [newEmail, setNewEmail] = useState("")
  const [newName, setNewName] = useState("")
  const [saving, setSaving] = useState(false)

  const handleAdd = async () => {
    if (!newEmail) return
    setSaving(true)
    try {
      await addAdminUser(newEmail.trim(), newName.trim() || null)
      setNewEmail(""); setNewName("")
      await reload()
    } catch (err) { alert('שגיאה: ' + err.message) }
    finally { setSaving(false) }
  }

  const handleRemove = async (id, email) => {
    if (email === currentUserEmail) {
      alert('לא ניתן להסיר את עצמך!')
      return
    }
    if (!confirm(`להסיר את ${email} מרשימת המנהלים?`)) return
    try {
      await removeAdminUser(id)
      await reload()
    } catch (err) { alert('שגיאה: ' + err.message) }
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-orange-500" /> הוסף מנהל חדש
        </h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <input type="email" placeholder="אימייל..." value={newEmail} onChange={e => setNewEmail(e.target.value)}
            className="filter-input flex-1" dir="ltr" />
          <input type="text" placeholder="שם (אופציונלי)" value={newName} onChange={e => setNewName(e.target.value)}
            className="filter-input w-full sm:w-48" />
          <button onClick={handleAdd} disabled={saving || !newEmail}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-orange-500 text-white text-sm font-semibold rounded-xl hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <Plus className="w-4 h-4" /> {saving ? 'מוסיף...' : 'הוסף'}
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">
            מנהלים ({adminUsers.length})
          </h3>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
          {adminUsers.map(u => (
            <div key={u.id} className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                  <Crown className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-slate-900 dark:text-white">{u.name || u.email}</p>
                  <p className="text-xs text-slate-400" dir="ltr">{u.email}</p>
                </div>
                {u.email === currentUserEmail && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">אתה</span>
                )}
              </div>
              <button onClick={() => handleRemove(u.id, u.email)}
                disabled={u.email === currentUserEmail}
                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============ SEASON ADMIN ============
function SeasonAdmin({ games, teams, players, reload }) {
  const [archivedSeasons, setArchivedSeasons] = useState([])
  const [seasonName, setSeasonName] = useState("")
  const [archiving, setArchiving] = useState(false)
  const [confirmText, setConfirmText] = useState("")
  const [showConfirm, setShowConfirm] = useState(false)
  const { setSeasonMode } = useSeasonMode()

  useEffect(() => {
    getArchivedSeasons().then(setArchivedSeasons).catch(() => {})
  }, [])

  const completedGames = games.filter(g => g.status === 'completed').length
  const totalGoals = teams.reduce((sum, t) => sum + (t.goals_for || 0), 0)

  const handleArchive = async () => {
    if (confirmText !== seasonName) return
    setArchiving(true)
    try {
      await archiveAndResetSeason(seasonName)
      setSeasonMode('regular')
      setShowConfirm(false)
      setConfirmText("")
      setSeasonName("")
      const seasons = await getArchivedSeasons()
      setArchivedSeasons(seasons)
      await reload()
      alert('העונה אורכבה בהצלחה! כל הנתונים אופסו לעונה חדשה.')
    } catch (err) { alert('שגיאה: ' + err.message) }
    finally { setArchiving(false) }
  }

  return (
    <div className="space-y-4">
      {/* Current season summary */}
      <div className="card p-5">
        <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <Archive className="w-4 h-4 text-orange-500" /> סיום עונה וארכוב
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
          פעולה זו תשמור את כל נתוני העונה הנוכחית בארכיון ותאפס את כל הסטטיסטיקות לקראת העונה הבאה.
        </p>

        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 text-center">
            <p className="text-lg font-extrabold text-slate-900 dark:text-white">{games.length}</p>
            <p className="text-[10px] text-slate-400 font-medium">משחקים</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 text-center">
            <p className="text-lg font-extrabold text-slate-900 dark:text-white">{completedGames}</p>
            <p className="text-[10px] text-slate-400 font-medium">הושלמו</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 text-center">
            <p className="text-lg font-extrabold text-slate-900 dark:text-white">{players.length}</p>
            <p className="text-[10px] text-slate-400 font-medium">שחקנים</p>
          </div>
        </div>

        {!showConfirm ? (
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">שם העונה לארכוב</label>
              <input type="text" value={seasonName} onChange={e => setSeasonName(e.target.value)}
                className="filter-input w-full" placeholder="לדוגמה: 2024-25" dir="ltr" />
            </div>
            <button onClick={() => { if (seasonName) setShowConfirm(true) }}
              disabled={!seasonName}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <Archive className="w-4 h-4" /> ארכב וסיים עונה
            </button>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-sm text-red-700 dark:text-red-400">אישור סיום עונה</h4>
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  פעולה זו תארכב את עונת <strong>{seasonName}</strong> ותאפס את כל הסטטיסטיקות.
                  המשחקים, התוצאות וכל הנתונים יישמרו בארכיון אך יימחקו מהעמודים הפעילים.
                </p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-2 font-semibold">
                  הקלד את שם העונה "{seasonName}" לאישור:
                </p>
              </div>
            </div>
            <input type="text" value={confirmText} onChange={e => setConfirmText(e.target.value)}
              className="filter-input w-full border-red-300 dark:border-red-700" placeholder={seasonName} dir="ltr" />
            <div className="flex gap-2">
              <button onClick={handleArchive}
                disabled={archiving || confirmText !== seasonName}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {archiving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    מארכב...
                  </>
                ) : (
                  <>
                    <Archive className="w-4 h-4" /> אשר ארכוב
                  </>
                )}
              </button>
              <button onClick={() => { setShowConfirm(false); setConfirmText("") }}
                className="px-4 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                ביטול
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Archived seasons list */}
      {archivedSeasons.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Archive className="w-4 h-4 text-blue-500" /> עונות בארכיון ({archivedSeasons.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {archivedSeasons.map(s => (
              <div key={s.id} className="flex items-center justify-between px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Trophy className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-slate-900 dark:text-white">עונת {s.name}</p>
                    <p className="text-[11px] text-slate-400">אורכבה {new Date(s.archived_at).toLocaleDateString('he-IL')}</p>
                  </div>
                </div>
                <a href={`/archive/${s.id}`}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors">
                  צפייה →
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

