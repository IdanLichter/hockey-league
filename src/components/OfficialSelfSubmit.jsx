import { useState, useEffect } from "react"
import { Gavel, HeartPulse, Loader2, Pencil, Check } from "lucide-react"
import { useAuth } from "@/lib/AuthContext"
import { applyAsOfficial, getMyOfficialRoles, OFFICIAL_ROLE_LABEL } from "@/lib/officials"
import { getMyContact, saveMyContact, officialApplyError } from "@/lib/contact"

const roleIcon = { judge: Gavel, medic: HeartPulse }

/**
 * D4 — a judge/medic self-submits to work an upcoming game; the league manager approves
 * it (in the Officials admin tab). Renders only for a scheduled game to a judge/medic.
 *
 * P3 (sheet rows 16, 17): applying now requires a full name on file, and a phone as well
 * for a medic, since both end up on the game sheet. The details are collected right here
 * rather than by sending someone off to /me — the moment they matter is the moment to
 * ask for them.
 */
export default function OfficialSelfSubmit({ game }) {
  const { isJudgeRole, isMedic } = useAuth()
  const roles = [...(isJudgeRole ? ["judge"] : []), ...(isMedic ? ["medic"] : [])]
  const [mine, setMine] = useState([])
  const [busy, setBusy] = useState(null)
  const [contact, setContact] = useState(null)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [savingContact, setSavingContact] = useState(false)
  const [err, setErr] = useState(null)

  const active = roles.length > 0 && game.status === "scheduled"

  useEffect(() => {
    if (!active) return
    let alive = true
    Promise.all([getMyOfficialRoles(game.id), getMyContact()]).then(([r, c]) => {
      if (!alive) return
      setMine(r)
      setContact(c)
      setName(c?.full_name || "")
      setPhone(c?.phone || "")
    }).catch(() => {})
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id, roles.length, game.status])

  if (!active) return null

  const needsName = !contact?.full_name?.trim()
  const needsPhone = isMedic && !contact?.phone?.trim()
  const showForm = editing || needsName || needsPhone

  const saveContact = async (e) => {
    e.preventDefault()
    setSavingContact(true); setErr(null)
    try {
      await saveMyContact(name, phone)
      setContact({ full_name: name.trim(), phone: phone.trim() })
      setEditing(false)
    } catch (e2) { setErr(e2.message) } finally { setSavingContact(false) }
  }

  const apply = async (role) => {
    setBusy(role); setErr(null)
    try {
      await applyAsOfficial(game.id, role)
      setMine(await getMyOfficialRoles(game.id))
    } catch (e2) {
      // Previously swallowed. The refusal is now usually something the user can fix in
      // the form right above, so saying nothing would be the worst possible response.
      setErr(officialApplyError(e2))
      setEditing(true)
    } finally { setBusy(null) }
  }

  const statusOf = (s) => s === "approved" ? { t: "שובצת ✓", c: "text-emerald-600 dark:text-emerald-400" }
    : s === "rejected" ? { t: "המועמדות נדחתה", c: "text-red-500" }
    : { t: "ממתין לאישור מנהל הליגה", c: "text-amber-600 dark:text-amber-400" }

  return (
    <div className="card p-4 space-y-3">
      <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
        <Gavel className="w-4 h-4 text-brand" /> הגשת מועמדות לשיבוץ
      </p>

      {showForm ? (
        <form onSubmit={saveContact} className="space-y-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
          <p className="text-[11px] text-slate-600 dark:text-slate-300">
            {needsName || needsPhone
              ? `כדי להגיש מועמדות יש להזין שם מלא${isMedic ? " וטלפון — הם מופיעים בטופס המשחק" : " — הוא מופיע בטופס המשחק"}`
              : "פרטי הקשר שלך"}
          </p>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="שם מלא" aria-label="שם מלא"
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand/30" />
          {/* dir=ltr so a phone number reads left-to-right inside the RTL card */}
          <input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" dir="ltr"
            placeholder={isMedic ? "טלפון (חובה לחובש)" : "טלפון (רשות)"} aria-label="טלפון"
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand/30" />
          <button type="submit" disabled={savingContact || !name.trim()}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-brand text-brand-fg hover:bg-brand-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {savingContact ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} שמירת פרטים
          </button>
        </form>
      ) : (
        <p className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="truncate">
            {contact.full_name}
            {contact.phone ? <> · <span dir="ltr">{contact.phone}</span></> : null}
          </span>
          <button onClick={() => setEditing(true)} aria-label="עריכת פרטי קשר"
            className="shrink-0 text-slate-400 hover:text-brand transition-colors">
            <Pencil className="w-3 h-3" />
          </button>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {roles.map(role => {
          const RIcon = roleIcon[role]
          const m = mine.find(x => x.role === role)
          if (m) {
            const st = statusOf(m.status)
            return (
              <span key={role} className={`inline-flex items-center gap-1.5 text-xs font-semibold ${st.c}`}>
                <RIcon className="w-3.5 h-3.5" /> {OFFICIAL_ROLE_LABEL[role]}: {st.t}
              </span>
            )
          }
          // A medic needs a phone; a judge only a name. Disable rather than let the
          // server refuse, and say why in the tooltip.
          const blocked = needsName || (role === "medic" && !contact?.phone?.trim())
          return (
            <button key={role} onClick={() => apply(role)} disabled={busy === role || blocked}
              title={blocked ? "יש להשלים את פרטי הקשר תחילה" : undefined}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-brand text-brand-fg hover:bg-brand-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {busy === role ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RIcon className="w-3.5 h-3.5" />}
              הגש מועמדות כ{OFFICIAL_ROLE_LABEL[role]}
            </button>
          )
        })}
      </div>

      {err && <p className="text-[11px] text-red-600 dark:text-red-400">{err}</p>}
    </div>
  )
}
