import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Smartphone, Users, UserCheck, AlertTriangle, RefreshCw, Search, Monitor, Info } from "lucide-react"
import { getAppUsers } from "@/lib/appUsers"
import { entityPath } from "@/lib/slugs"
import { SkeletonPanelRows } from "@/components/skeletons/PageSkeletons"

/**
 * משתמשי אפליקציה — every account, and whether it has signed in on the iOS / Android
 * app, whether it is linked to a player card, and whether it looks like the same
 * person's SECOND account (Apple in the app + Google on the web is the usual way
 * that happens). Admin-only: admin_app_users() refuses anyone else.
 *
 * There is no install event anywhere. An app that was downloaded and never signed
 * in to is invisible here by construction — App Store Connect is the only place
 * that counts those.
 */

const PROVIDER_LABEL = { google: "Google", apple: "Apple", email: "אימייל" }

const FILTERS = [
  { id: "all", label: "הכל" },
  { id: "app", label: "עם אפליקציה" },
  { id: "noapp", label: "בלי אפליקציה" },
  { id: "nocard", label: "ללא כרטיס שחקן" },
  { id: "dups", label: "חשבון כפול?" },
]

/** Hebrew relative day count — "היום", "אתמול", "לפני 12 ימים". */
function daysAgo(iso) {
  if (!iso) return null
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (d <= 0) return "היום"
  if (d === 1) return "אתמול"
  return `לפני ${d} ימים`
}

function Stat({ icon: Icon, label, value, sub, tone = "brand" }) {
  const tones = {
    brand: "text-brand bg-brand/10",
    amber: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
  }
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${tones[tone]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{value}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{label}</div>
        {sub && <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{sub}</div>}
      </div>
    </div>
  )
}

function Chip({ children, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    brand: "bg-brand/10 text-brand",
    green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  }
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${tones[tone]}`}>{children}</span>
}

export default function AppUsersAdmin() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [filter, setFilter] = useState("all")
  const [q, setQ] = useState("")

  const load = async () => {
    setLoading(true); setErr(null)
    try { setRows(await getAppUsers()) }
    catch (e) { setErr(e.message || "שגיאה") }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const byId = useMemo(() => Object.fromEntries(rows.map(r => [r.user_id, r])), [rows])
  const hasApp = (r) => r.has_ios || r.has_android

  const totals = useMemo(() => {
    const app = rows.filter(hasApp)
    return {
      accounts: rows.length,
      app: app.length,
      ios: app.filter(r => r.has_ios).length,
      android: app.filter(r => r.has_android).length,
      linked: rows.filter(r => r.player_id).length,
      appLinked: app.filter(r => r.player_id).length,
      dups: rows.filter(r => r.duplicate_of?.length).length,
    }
  }, [rows])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return rows.filter(r => {
      if (filter === "app" && !hasApp(r)) return false
      if (filter === "noapp" && hasApp(r)) return false
      if (filter === "nocard" && r.player_id) return false
      if (filter === "dups" && !r.duplicate_of?.length) return false
      if (!s) return true
      return `${r.display_name || ""} ${r.email || ""} ${r.player_name || ""}`.toLowerCase().includes(s)
    })
  }, [rows, filter, q])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-brand" /> משתמשי אפליקציה
        </h2>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> רענון
        </button>
      </div>

      {err && <div className="card p-4 text-sm text-red-600 dark:text-red-400">לא ניתן לטעון: {err}</div>}

      {loading && !rows.length && !err ? <SkeletonPanelRows /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat icon={Users} label="חשבונות" value={totals.accounts} />
            <Stat icon={Smartphone} label="התחברו באפליקציה" value={totals.app} sub={`iPhone ${totals.ios} · Android ${totals.android}`} />
            <Stat icon={UserCheck} label="מקושרים לכרטיס שחקן" value={totals.linked} sub={`מתוכם באפליקציה: ${totals.appLinked}`} />
            <Stat icon={AlertTriangle} label="חשבון כפול אפשרי" value={totals.dups} tone={totals.dups ? "amber" : "brand"} />
          </div>

          <p className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Info className="w-4 h-4 shrink-0 mt-px" />
            <span>
              מי שהוריד את האפליקציה ולא התחבר לא מופיע כאן — אין לנו שום סימן להורדה עצמה (את זה רואים רק ב־App Store Connect).
              ״נראה לאחרונה״ מבוסס על התחברויות, התראות ופעילות — תאריכים ישנים יכולים להיות מוקדמים מהאמת.
            </span>
          </p>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 card p-1 flex-wrap">
              {FILTERS.map(f => (
                <button key={f.id} onClick={() => setFilter(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    filter === f.id ? "bg-brand text-white" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>
            <label className="relative flex-1 min-w-[180px]">
              <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 right-3 text-slate-400 pointer-events-none" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש שם / אימייל / שחקן"
                className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm" />
            </label>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400">{shown.length} חשבונות</div>

          <ul className="space-y-2">
            {shown.map(r => (
              <li key={r.user_id} className="card p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-white truncate">{r.display_name || "ללא שם"}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate" dir="ltr">{r.email}</div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {r.has_ios && <Chip tone="brand"><Smartphone className="w-3 h-3" /> iPhone{r.ios_build ? ` · build ${r.ios_build}` : ""}</Chip>}
                    {r.has_android && <Chip tone="brand"><Smartphone className="w-3 h-3" /> Android{r.android_version ? ` · ${r.android_version}` : ""}</Chip>}
                    {!hasApp(r) && <Chip><Monitor className="w-3 h-3" /> אתר בלבד</Chip>}
                  </div>
                </div>

                <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-slate-600 dark:text-slate-300">
                  <span>
                    כרטיס שחקן:{" "}
                    {r.player_id
                      ? <Link to={entityPath("players", r.player_id)} className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline">{r.player_name || "מקושר"}</Link>
                      : <span className="font-semibold text-slate-400">אין</span>}
                  </span>
                  <span>כניסה עם: {(r.providers || []).map(p => PROVIDER_LABEL[p] || p).join(" + ") || "—"}</span>
                  {hasApp(r) && <span>באפליקציה: {daysAgo(r.app_last_seen) || "—"}</span>}
                  {r.web_last_seen && <span>באתר: {daysAgo(r.web_last_seen)}</span>}
                  <span className="text-slate-400">נרשם {new Date(r.created_at).toLocaleDateString("he-IL")}</span>
                </div>

                {r.duplicate_of?.length > 0 && (
                  <div className="flex items-start gap-2 text-xs rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-300 px-3 py-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                    <span>
                      ייתכן שזה אותו אדם כמו:{" "}
                      {r.duplicate_of.map(id => byId[id]).filter(Boolean).map(o =>
                        `${o.display_name || "ללא שם"} (${o.email}${o.player_id ? ", מקושר לכרטיס" : ""})`).join(" · ")}
                      . איחוד חשבונות נעשה כרגע ידנית.
                    </span>
                  </div>
                )}
              </li>
            ))}
            {!shown.length && <li className="card p-6 text-center text-sm text-slate-500">אין חשבונות שמתאימים לסינון</li>}
          </ul>
        </>
      )}
    </div>
  )
}
