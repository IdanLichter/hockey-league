import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { motion } from "framer-motion"
import {
  UserCircle, Shield, Gavel, UserCheck, LogIn, LogOut, Sun, Moon,
  Save, Loader2, Clock, ChevronLeft, UserPlus, Trophy
} from "lucide-react"
import { useAuth } from "@/lib/AuthContext"
import { useTheme } from "@/lib/ThemeContext"
import { getMyProfile, updateMyProfile } from "@/lib/profile"

function Badge({ icon: Icon, label, cls }) {
  return (
    <span className={`stat-pill ${cls}`}>
      <Icon className="w-3.5 h-3.5" /> {label}
    </span>
  )
}

export default function Profile() {
  const { user, isAdmin, hasRole, loading: authLoading, signOut, openAuth } = useAuth()
  const { dark, toggle } = useTheme()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState("")
  const [avatar, setAvatar] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let alive = true
    if (authLoading) return
    if (!user) { setLoading(false); return }
    setLoading(true)
    getMyProfile()
      .then(d => {
        if (!alive) return
        setData(d)
        setName(d?.profile?.display_name || "")
        setAvatar(d?.profile?.avatar_url || "")
      })
      .catch(() => alive && setData(null))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [user, authLoading])

  const handleSave = async () => {
    setSaving(true); setSaved(false)
    try {
      await updateMyProfile({ display_name: name.trim() || null, avatar_url: avatar.trim() || null })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  // ---- signed-out ----
  if (!authLoading && !user) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto">
        <div className="card p-10 flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <UserCircle className="w-9 h-9 text-slate-400" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">הדף שלי</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">התחברו כדי לראות את החשבון שלכם</p>
          </div>
          <button onClick={openAuth} className="flex items-center gap-2 px-5 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors">
            <LogIn className="w-4 h-4" /> התחברות / הרשמה
          </button>
        </div>
      </div>
    )
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-orange-500 border-t-transparent" />
      </div>
    )
  }

  const player = data?.player || null
  const pendingClaim = data?.pendingClaim || null
  const isJudge = hasRole("judge")
  const isPlayer = !!player
  const isGuest = !isAdmin && !isJudge && !isPlayer
  const displayName = name || user.email?.split("@")[0] || "חבר/ת הליגה"
  const initial = (displayName || "?").trim().charAt(0).toUpperCase()

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card p-5 sm:p-6">
        <div className="flex items-center gap-4">
          {avatar ? (
            <img src={avatar} alt="" className="w-20 h-20 rounded-2xl object-cover shrink-0 bg-slate-100 dark:bg-slate-700" />
          ) : (
            <div className="w-20 h-20 rounded-2xl shrink-0 flex items-center justify-center bg-orange-500 text-white text-2xl font-extrabold">
              {initial}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="page-title truncate">{displayName}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 truncate mt-0.5">{user.email}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
              {isAdmin && <Badge icon={Shield} label="מנהל" cls="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400" />}
              {isJudge && <Badge icon={Gavel} label="שופט" cls="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" />}
              {isPlayer && <Badge icon={UserCheck} label="שחקן/ית" cls="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" />}
              {isGuest && <Badge icon={UserCircle} label="אורח/ת" cls="bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400" />}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Linked player / claim status / guest pairing CTA */}
      {isPlayer ? (
        <Link to={`/players/${player.id}`} className="card card-hover p-4 flex items-center justify-between gap-3 group">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{player.first_name} {player.last_name}</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">הדף האישי שלך כשחקן — סטטיסטיקות ויומן משחקים</p>
            </div>
          </div>
          <ChevronLeft className="w-5 h-5 text-slate-300 dark:text-slate-600 group-hover:text-orange-500 transition-colors shrink-0" />
        </Link>
      ) : pendingClaim ? (
        <div className="card p-4 flex items-center gap-3 border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20">
          <Clock className="w-5 h-5 text-amber-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">בקשת בעלות ממתינה לאישור מנהל</p>
            <p className="text-[11px] text-amber-600/80 dark:text-amber-500/80 truncate">
              {pendingClaim.players ? `${pendingClaim.players.first_name} ${pendingClaim.players.last_name}` : "שחקן"}
            </p>
          </div>
        </div>
      ) : (
        <div className="card p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
              <UserPlus className="w-5 h-5 text-orange-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 dark:text-white">שיחקת בליגה?</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">שייכו את החשבון לפרופיל השחקן שלכם וקבלו גישה לסטטיסטיקות שלכם</p>
            </div>
          </div>
          <Link to="/players" className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors shrink-0">
            מצא/י את הפרופיל
          </Link>
        </div>
      )}

      {/* Role quick-links */}
      {(isJudge || isAdmin) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {isJudge && (
            <Link to="/judge" className="card card-hover p-4 flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-xl bg-purple-500 text-white flex items-center justify-center shrink-0"><Gavel className="w-5 h-5" /></div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white">שיפוט משחקים</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">ניהול תוצאות בזמן אמת</p>
              </div>
            </Link>
          )}
          {isAdmin && (
            <Link to="/admin" className="card card-hover p-4 flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center shrink-0"><Shield className="w-5 h-5" /></div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white">ניהול הליגה</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">משחקים, שחקנים ובקשות בעלות</p>
              </div>
            </Link>
          )}
        </div>
      )}

      {/* Settings */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="card p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide">הגדרות</h2>

        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">שם תצוגה</label>
          <input
            value={name}
            onChange={e => setName(e.target.value.slice(0, 60))}
            placeholder="איך שיופיע בפוסטים ובתגובות"
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">כתובת תמונת פרופיל (URL)</label>
          <input
            value={avatar}
            onChange={e => setAvatar(e.target.value)}
            placeholder="https://…"
            dir="ltr"
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 text-left"
          />
        </div>

        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Trophy className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? "נשמר" : "שמירה"}
        </button>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-700/50 flex flex-wrap items-center gap-2">
          <button onClick={toggle}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-colors">
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {dark ? "מצב בהיר" : "מצב כהה"}
          </button>
          <button onClick={() => signOut()}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 border border-red-100 dark:border-red-900/50 transition-colors">
            <LogOut className="w-4 h-4" /> התנתקות
          </button>
        </div>
      </motion.div>
    </div>
  )
}
