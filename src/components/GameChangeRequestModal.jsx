import { useState } from "react"
import { format } from "date-fns"
import { motion } from "framer-motion"
import { X, CalendarClock, Send } from "lucide-react"
import { requestGameChange } from "@/lib/gameRequests"

/**
 * Coach-facing modal to request a reschedule (new date/time and/or venue) for a
 * game they coach. Only the FIELDS THAT ACTUALLY CHANGED are sent — leaving one
 * as-is means "don't touch it". A reason is required. On success the parent
 * reloads the game's request state (a pending chip replaces the button).
 */
export default function GameChangeRequestModal({ game, home, away, onClose, onSubmitted }) {
  const initialDate = game.game_date ? format(new Date(game.game_date), "yyyy-MM-dd'T'HH:mm") : ""
  const initialVenue = game.venue || ""

  const [date, setDate] = useState(initialDate)
  const [venue, setVenue] = useState(initialVenue)
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const dateChanged = !!date && date !== initialDate
  const venueChanged = venue.trim() !== initialVenue.trim() && venue.trim() !== ""
  const canSubmit = (dateChanged || venueChanged) && !!reason.trim() && !saving

  const submit = async () => {
    setError(null)
    if (!dateChanged && !venueChanged) { setError("יש לשנות תאריך/שעה או מגרש"); return }
    if (!reason.trim()) { setError("יש להזין סיבה לבקשה"); return }
    setSaving(true)
    try {
      await requestGameChange(game.id, {
        proposedDate: dateChanged ? new Date(date).toISOString() : null,
        proposedVenue: venueChanged ? venue.trim() : null,
        reason: reason.trim(),
      })
      onSubmitted?.()
      onClose()
    } catch (e) {
      setError(e.message || "שגיאה בשליחת הבקשה")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="card w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
            <CalendarClock className="w-5 h-5 text-brand" /> בקשת שינוי למשחק
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <p className="text-sm text-slate-500 dark:text-slate-400">
          {home?.name || "בית"} <span className="text-slate-400">נגד</span> {away?.name || "חוץ"}
          <span className="block text-xs mt-1">
            כרגע: {game.game_date ? format(new Date(game.game_date), "d/M/yyyy HH:mm") : "—"}
            {" · "}{game.venue || "ללא מגרש"}
          </span>
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">תאריך ושעה חדשים</label>
            <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className="filter-input w-full" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">מגרש חדש</label>
            <input type="text" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="שם המגרש" className="filter-input w-full" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">סיבה <span className="text-red-500">*</span></label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
              placeholder="למשל: המגרש תפוס, חפיפה עם משחק אחר, מזג אוויר…"
              className="filter-input w-full resize-none" />
          </div>
        </div>

        {error && (
          <div className="rounded-lg px-3 py-2 text-sm bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400">{error}</div>
        )}

        <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-snug">
          הבקשה תישלח למנהל הליגה לאישור. שנה רק את מה שברצונך לשנות — שדה שנשאר כפי שהוא לא ישתנה.
        </p>

        <div className="flex gap-2">
          <button onClick={submit} disabled={!canSubmit}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-brand text-brand-fg text-sm font-semibold rounded-xl hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <Send className="w-4 h-4" /> {saving ? "שולח…" : "שלח בקשה"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
            ביטול
          </button>
        </div>
      </motion.div>
    </div>
  )
}
