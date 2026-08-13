import { useState } from "react"
import { motion } from "framer-motion"
import { X, FileSpreadsheet, Download } from "lucide-react"
import { useAuth } from "@/lib/AuthContext"
import { getGameFormSources, buildReport, defaultFormFields, guestEntries, gameFormFilename } from "@/lib/gameReport"

/**
 * Export a played game as the league's official refereeing form (טופס שיפוט), filled
 * in — same .xlsx layout the judge gets as a blank, plus a חובש section the blank
 * form has no room for.
 *
 * The dialog exists because the app records a box score, not a match sheet. Half-time
 * score, the extra officials, coach and captain names have no column in the database,
 * so they are asked for here rather than exported blank — and the medic comes back
 * pre-filled from whoever was actually assigned to work the game. Team fouls, timeout
 * minutes and every signature stay empty by design: those are filled at the rink.
 *
 * The generator is a dynamic import — the baked form template is ~100kB and no other
 * page has any use for it.
 */

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

function downloadBytes(bytes, filename) {
  const url = URL.createObjectURL(new Blob([bytes], { type: XLSX_MIME }))
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">{label}</label>
      {children}
    </div>
  )
}

export default function GameFormExport({ game, home, away, players, stats, refereeName }) {
  const { isAdmin, isJudgeRole, isLeagueManager, coachTeamIds } = useAuth()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [sources, setSources] = useState(null)
  const [fields, setFields] = useState(null)

  // Same set the game_squad / game_report_officials RPCs let read a game's roster.
  const coachOfThis = (coachTeamIds || []).some(t => t === game.home_team_id || t === game.away_team_id)
  const canExport = isAdmin || isLeagueManager || isJudgeRole || coachOfThis
  if (game.status !== "completed" || !canExport) return null

  const guests = guestEntries(stats || [])
  const set = (key) => (e) => setFields(f => ({ ...f, [key]: e.target.value }))

  const openDialog = async () => {
    setOpen(true); setError(null); setLoading(true)
    try {
      const src = await getGameFormSources(game.id)
      setSources(src)
      setFields(defaultFormFields({ game, stats: stats || [], officials: src.officials }))
    } catch (e) {
      // The squad and officials only add to what the game page already holds, so a
      // failure here downgrades the export rather than blocking it — open the dialog
      // with empty defaults instead of spinning on absent `fields`.
      console.error(e)
      setError("חלק מהנתונים לא נטענו — אפשר להשלים ידנית ולייצא")
      setSources({ squad: [], officials: [], memberships: [] })
      setFields(defaultFormFields({ game, stats: stats || [], officials: [] }))
    } finally { setLoading(false) }
  }

  const close = () => { setOpen(false); setError(null) }

  const exportForm = async () => {
    setBusy(true); setError(null)
    try {
      const { buildGameForm } = await import("@/lib/gameForm/buildGameForm")
      const report = buildReport({
        game, home, away,
        players: players || [],
        stats: stats || [],
        squad: sources?.squad || [],
        memberships: sources?.memberships || [],
        refereeName,
        fields,
      })
      downloadBytes(buildGameForm(report), gameFormFilename({ game, home, away }))
      close()
    } catch (e) {
      console.error(e)
      setError("שגיאה ביצירת הטופס, נסו שוב")
    } finally { setBusy(false) }
  }

  return (
    <>
      <button onClick={openDialog} className="btn-secondary btn-sm">
        <FileSpreadsheet className="w-3.5 h-3.5" /> ייצוא טופס משחק
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={close}>
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="card w-full max-w-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <FileSpreadsheet className="w-5 h-5 text-brand" /> ייצוא טופס משחק
              </h3>
              <button onClick={close} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"><X className="w-4 h-4 text-slate-400" /></button>
            </div>

            <p className="text-sm text-slate-500 dark:text-slate-400">
              {home?.name || "בית"} <span className="text-slate-400">נגד</span> {away?.name || "חוץ"}
              <span className="block text-xs mt-1">
                התאריך, המגרש, השופט, ההרכבים, השערים, הכרטיסים והתוצאה ימולאו אוטומטית.
                השלימו כאן את מה שאינו נשמר במערכת.
              </span>
            </p>

            {loading || !fields ? (
              <div className="flex items-center justify-center py-10">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand border-t-transparent" />
              </div>
            ) : (
              <div className="space-y-3">
                <Field label="שם החובש">
                  <input value={fields.medic} onChange={set("medic")} placeholder="שם מלא" className="filter-input w-full" />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="שופט נוסף">
                    <input value={fields.extraReferee} onChange={set("extraReferee")} className="filter-input w-full" />
                  </Field>
                  <Field label="צופה שופטים">
                    <input value={fields.observer} onChange={set("observer")} className="filter-input w-full" />
                  </Field>
                </div>

                <Field label="תוצאת מחצית">
                  <div className="flex items-center gap-2">
                    <input type="number" min="0" value={fields.halftimeHome} onChange={set("halftimeHome")}
                      placeholder={home?.name || "מארחת"} className="filter-input flex-1" />
                    <span className="text-slate-400 text-sm">:</span>
                    <input type="number" min="0" value={fields.halftimeAway} onChange={set("halftimeAway")}
                      placeholder={away?.name || "אורחת"} className="filter-input flex-1" />
                  </div>
                </Field>

                {[["home", home, "מארחת"], ["away", away, "אורחת"]].map(([side, team, label]) => (
                  <div key={side} className="grid grid-cols-2 gap-3">
                    <Field label={`מאמן/ת — ${team?.name || label}`}>
                      <input value={fields[`${side}Coach`]} onChange={set(`${side}Coach`)} className="filter-input w-full" />
                    </Field>
                    <Field label={`קפטן — ${team?.name || label}`}>
                      <input value={fields[`${side}Captain`]} onChange={set(`${side}Captain`)} className="filter-input w-full" />
                    </Field>
                  </div>
                ))}

                {guests.length > 0 && (
                  <Field label="שחקנים אורחים — לאיזו קבוצה לשייך">
                    <div className="space-y-2">
                      {guests.map(g => (
                        <div key={g.id} className="flex items-center gap-2">
                          <span className="flex-1 text-sm text-slate-600 dark:text-slate-300 truncate">
                            {g.name}{g.from ? <span className="text-xs text-slate-400"> · {g.from}</span> : null}
                          </span>
                          <select
                            value={fields.guestTeams?.[g.id] || "home"}
                            onChange={(e) => setFields(f => ({ ...f, guestTeams: { ...f.guestTeams, [g.id]: e.target.value } }))}
                            className="filter-input shrink-0"
                          >
                            <option value="home">{home?.name || "מארחת"}</option>
                            <option value="away">{away?.name || "אורחת"}</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  </Field>
                )}

                <Field label="הערות שופט">
                  <textarea value={fields.refereeNotes} onChange={set("refereeNotes")} rows={2} className="filter-input w-full resize-none" />
                </Field>
              </div>
            )}

            {error && <div className="rounded-lg px-3 py-2 text-sm bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400">{error}</div>}

            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
              עבירות קבוצתיות, פסקי הזמן והחתימות נשארים ריקים למילוי ידני — הם אינם נשמרים במערכת.
            </p>

            <div className="flex gap-2">
              <button onClick={exportForm} disabled={busy || loading || !fields} className="btn-primary flex-1 py-2.5">
                <Download className="w-4 h-4" /> {busy ? "מייצא…" : "ייצא טופס"}
              </button>
              <button onClick={close} className="px-4 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">ביטול</button>
            </div>
          </motion.div>
        </div>
      )}
    </>
  )
}
