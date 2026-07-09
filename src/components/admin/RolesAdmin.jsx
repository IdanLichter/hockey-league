import { useState, useEffect, useMemo } from "react"
import { getProfiles, getAllRoles, grantRole, revokeRole, ROLES, ROLE_LABEL, TEAM_SCOPED } from "@/lib/roles"
import { Award, X, Plus, RefreshCw, Check, Loader2, Search } from "lucide-react"

/**
 * Admin UI to grant/revoke user roles (player / coach / content_editor / judge),
 * team-scoped for coach & player. This is what makes the role tiers actually apply
 * — e.g. granting `judge` lets a non-admin run the live scoreboard. Self-contained;
 * `teamsMap`/`players` are only for names + team scoping.
 */
export default function RolesAdmin({ teamsMap = {}, players = [] }) {
  const [profiles, setProfiles] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(null) // { profileId, role, teamId }
  const [search, setSearch] = useState("")

  const playersMap = useMemo(() => Object.fromEntries(players.map(p => [p.id, p])), [players])
  const teams = useMemo(() => Object.values(teamsMap).filter(Boolean), [teamsMap])

  // Filter by display name or the linked player's name.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return profiles
    return profiles.filter(p => {
      const linked = p.player_id ? playersMap[p.player_id] : null
      const hay = `${p.display_name || ""} ${linked ? `${linked.first_name} ${linked.last_name}` : ""}`.toLowerCase()
      return hay.includes(q)
    })
  }, [profiles, search, playersMap])

  const load = async () => {
    try {
      setLoading(true); setError(null)
      const [ps, rs] = await Promise.all([getProfiles(), getAllRoles()])
      setProfiles(ps); setRoles(rs)
    } catch { setError("שגיאה בטעינת המשתמשים") }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const rolesFor = (uid) => roles.filter(r => r.user_id === uid)

  const doGrant = async () => {
    if (!form?.role) return
    if (TEAM_SCOPED.has(form.role) && form.role === "coach" && !form.teamId) { setError("יש לבחור קבוצה למאמן"); return }
    setBusy(true); setError(null)
    try {
      await grantRole(form.profileId, form.role, form.teamId || null)
      setForm(null); await load()
    } catch (e) {
      setError(e?.code === "23505" ? "התפקיד כבר מוענק" : "שגיאה בהענקת התפקיד")
    } finally { setBusy(false) }
  }

  const doRevoke = async (id) => {
    setBusy(true); setError(null)
    try { await revokeRole(id); await load() }
    catch { setError("שגיאה בהסרת התפקיד") }
    finally { setBusy(false) }
  }

  const openForm = (p) => {
    // default a player grant to the linked player's team
    const linkedTeam = p.player_id ? (playersMap[p.player_id]?.team_id || "") : ""
    setForm({ profileId: p.id, role: "judge", teamId: linkedTeam })
    setError(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-orange-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
            <Award className="w-5 h-5 text-orange-500" /> תפקידים והרשאות
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">הענקת תפקידים למשתמשים רשומים. שופט = הרשאה להפעיל את לוח השיפוט.</p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> רענון
        </button>
      </div>

      {error && (
        <div className="card p-3 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-400">{error}</div>
      )}

      {profiles.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-500 dark:text-slate-400">אין משתמשים רשומים עדיין</div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="חיפוש משתמש..."
              className="filter-input w-full pr-9"
            />
          </div>

          {filtered.length === 0 ? (
            <div className="card p-8 text-center text-sm text-slate-500 dark:text-slate-400">לא נמצאו משתמשים תואמים</div>
          ) : (
        <div className="space-y-2.5">
          {filtered.map(p => {
            const linked = p.player_id ? playersMap[p.player_id] : null
            const initial = (p.display_name || "?").charAt(0).toUpperCase()
            const myRoles = rolesFor(p.id)
            return (
              <div key={p.id} className="card p-4">
                <div className="flex items-center gap-3">
                  {p.avatar_url
                    ? <img src={p.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                    : <div className="w-9 h-9 rounded-full bg-orange-500 text-white flex items-center justify-center text-sm font-bold shrink-0">{initial}</div>}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{p.display_name || "משתמש"}</p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">{linked ? `משויך ל${linked.first_name} ${linked.last_name}` : "ללא שיוך שחקן"}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5 items-center">
                  {myRoles.map(r => (
                    <span key={r.id} className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                      {ROLE_LABEL[r.role] || r.role}{r.team_id ? ` · ${teamsMap[r.team_id]?.name || ""}` : ""}
                      <button onClick={() => doRevoke(r.id)} disabled={busy} className="text-slate-400 hover:text-red-500 disabled:opacity-40"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                  {myRoles.length === 0 && <span className="text-[11px] text-slate-400 dark:text-slate-500">אין תפקידים</span>}
                  {form?.profileId !== p.id && (
                    <button onClick={() => openForm(p)} className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-orange-400 hover:text-orange-500 transition-colors">
                      <Plus className="w-3 h-3" /> הוסף תפקיד
                    </button>
                  )}
                </div>

                {form?.profileId === p.id && (
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex flex-wrap items-center gap-2">
                    <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className="filter-select text-xs py-1.5">
                      {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                    {TEAM_SCOPED.has(form.role) && (
                      <select value={form.teamId} onChange={e => setForm(f => ({ ...f, teamId: e.target.value }))} className="filter-select text-xs py-1.5">
                        <option value="">{form.role === "coach" ? "בחר קבוצה" : "ללא קבוצה"}</option>
                        {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    )}
                    <button onClick={doGrant} disabled={busy} className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 transition-colors">
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} הענק
                    </button>
                    <button onClick={() => { setForm(null); setError(null) }} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">ביטול</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
          )}
        </>
      )}
    </div>
  )
}
