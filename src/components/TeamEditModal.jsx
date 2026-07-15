import { useState, useRef } from "react"
import { X, Loader2, Pencil, Image as ImageIcon } from "lucide-react"
import { updateTeamDetails, uploadTeamLogo } from "@/lib/api"
import TeamLogo from "@/components/TeamLogo"

const inputCls = "w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
const labelCls = "block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5"

/**
 * Coach/admin edits their team's descriptive fields + crest. Writes go through
 * update_team_details() and (for the crest) uploadTeamLogo() → set_team_logo().
 * Competitive stats (wins/points/goals) are NOT editable here — they stay
 * admin-only. onSaved() lets the caller refresh.
 */
export default function TeamEditModal({ team, onClose, onSaved }) {
  const [name, setName] = useState(team.name || "")
  const [city, setCity] = useState(team.city || "")
  const [venue, setVenue] = useState(team.home_venue || "")
  const [founded, setFounded] = useState(team.founded_year ? String(team.founded_year) : "")
  const [primary, setPrimary] = useState(team.primary_color || "#3B4FC4")
  const [secondary, setSecondary] = useState(team.secondary_color || "#1e2a78")
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)

  const pickLogo = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type?.startsWith("image/")) { setError("קובץ תמונה בלבד"); return }
    if (f.size > 3 * 1024 * 1024) { setError("תמונה עד 3MB"); return }
    setError(null); setLogoFile(f); setLogoPreview(URL.createObjectURL(f))
  }

  const save = async () => {
    if (!name.trim()) { setError("שם קבוצה חובה"); return }
    setSaving(true); setError(null)
    try {
      if (logoFile) await uploadTeamLogo(team.id, logoFile)
      await updateTeamDetails(team.id, {
        name: name.trim(),
        city: city.trim() || null,
        home_venue: venue.trim() || null,
        primary_color: primary,
        secondary_color: secondary,
        founded_year: founded ? parseInt(founded, 10) : null,
      })
      onSaved?.()
      onClose?.()
    } catch (e) {
      setError(
        e?.message === "not-authorized" ? "אין לך הרשאה לערוך קבוצה זו"
        : e?.message === "invalid founded year" ? "שנת ייסוד לא תקינה"
        : "שגיאה בשמירה, נסו שוב"
      )
    } finally { setSaving(false) }
  }

  // Live preview of the crest with the chosen file + color.
  const previewTeam = { ...team, name, primary_color: primary, logo_url: logoPreview || team.logo_url }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl relative max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label="סגור" className="absolute top-4 left-4 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
          <X className="w-5 h-5" />
        </button>

        <div className="p-6">
          <div className="flex items-center gap-2 mb-5">
            <Pencil className="w-5 h-5 text-orange-500" />
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">עריכת קבוצה</h3>
          </div>

          {/* Crest */}
          <div className="flex items-center gap-4 mb-4">
            <TeamLogo team={previewTeam} size={14} />
            <div>
              <input ref={fileRef} type="file" accept="image/*" onChange={pickLogo} className="hidden" />
              <button type="button" onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                <ImageIcon className="w-3.5 h-3.5" /> {team.logo_url || logoFile ? "החלפת סמל" : "העלאת סמל"}
              </button>
              <p className="text-[11px] text-slate-400 mt-1.5">PNG/JPG · עד 3MB</p>
            </div>
          </div>

          <div className="space-y-3.5">
            <div>
              <label className={labelCls}>שם הקבוצה</label>
              <input value={name} onChange={e => setName(e.target.value.slice(0, 50))} className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>עיר</label>
                <input value={city} onChange={e => setCity(e.target.value.slice(0, 40))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>שנת ייסוד</label>
                <input value={founded} onChange={e => setFounded(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  inputMode="numeric" placeholder="—" className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>אולם ביתי</label>
              <input value={venue} onChange={e => setVenue(e.target.value.slice(0, 60))} className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>צבע ראשי</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={primary} onChange={e => setPrimary(e.target.value)}
                    className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent cursor-pointer" />
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{primary}</span>
                </div>
              </div>
              <div>
                <label className={labelCls}>צבע משני</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={secondary} onChange={e => setSecondary(e.target.value)}
                    className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent cursor-pointer" />
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{secondary}</span>
                </div>
              </div>
            </div>
          </div>

          {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="mt-5 flex gap-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">ביטול</button>
            <button onClick={save} disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              שמירה
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
