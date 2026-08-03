import { useState, useMemo } from "react"
import { addPlayerToSquad } from "@/lib/squad"
import { UserPlus, Loader2, X } from "lucide-react"

/**
 * Manual squad addition (sheet rows 7, 8, 13). A coach adds a loaned goalkeeper or a
 * one-time youth call-up before kick-off; a judge may do it once the game is running.
 *
 * The player list is every player card in the league, grouped by their own team, so a
 * loan from another club is picked the same way as a teammate — the server records
 * which side he is turning out for. Players already in the squad are filtered out.
 *
 * The age confirmation is mandatory and deliberate: there is no birth date in the
 * schema, so "14 או כיתה ח, המוקדם מביניהם" cannot be computed. The coach vouches for
 * it and the confirmation is stored against the row.
 */
export default function AddSquadPlayer({ gameId, teamId, teamName, players = [], excludeIds, onAdded }) {
  const [open, setOpen] = useState(false)
  const [playerId, setPlayerId] = useState("")
  const [note, setNote] = useState("")
  const [ageOk, setAgeOk] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  // Grouped by the player's own team so "בהשאלה מ…" is obvious at a glance.
  const grouped = useMemo(() => {
    const skip = excludeIds instanceof Set ? excludeIds : new Set(excludeIds || [])
    const byTeam = new Map()
    for (const p of players) {
      if (skip.has(p.id)) continue
      const label = p.teamName || "ללא קבוצה"
      if (!byTeam.has(label)) byTeam.set(label, [])
      byTeam.get(label).push(p)
    }
    for (const list of byTeam.values()) {
      list.sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`, "he"))
    }
    // the coach's own team first, then the rest alphabetically
    return [...byTeam.entries()].sort(([a], [b]) =>
      a === teamName ? -1 : b === teamName ? 1 : a.localeCompare(b, "he"))
  }, [players, excludeIds, teamName])

  const reset = () => { setPlayerId(""); setNote(""); setAgeOk(false); setErr(null) }

  const submit = async (e) => {
    e.preventDefault()
    if (!playerId) { setErr("יש לבחור שחקן"); return }
    setSaving(true); setErr(null)
    try {
      await addPlayerToSquad(gameId, playerId, teamId, { note: note.trim() || null, ageConfirmed: ageOk })
      reset(); setOpen(false)
      onAdded?.()
    } catch (e2) {
      setErr(e2.message)
    } finally { setSaving(false) }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors">
        <UserPlus className="w-3.5 h-3.5" /> הוספת שחקן ידנית
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="mt-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">הוספת שחקן ל{teamName}</p>
        <button type="button" onClick={() => { reset(); setOpen(false) }} aria-label="ביטול"
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <select value={playerId} onChange={e => setPlayerId(e.target.value)} aria-label="בחירת שחקן"
        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand/30">
        <option value="">בחר שחקן…</option>
        {grouped.map(([label, list]) => (
          <optgroup key={label} label={label}>
            {list.map(p => (
              <option key={p.id} value={p.id}>
                {p.first_name} {p.last_name}{p.position === "Goalkeeper" ? " 🧤" : ""}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <input value={note} onChange={e => setNote(e.target.value)} maxLength={80}
        placeholder="הערה (למשל: שוער בהשאלה)" aria-label="הערה"
        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand/30" />

      <label className="flex items-start gap-2 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer">
        <input type="checkbox" checked={ageOk} onChange={e => setAgeOk(e.target.checked)}
          className="mt-0.5 accent-brand" />
        <span>אני מאשר/ת שהשחקן עומד בדרישת הגיל (14 או כיתה ח׳ — המוקדם מביניהם)</span>
      </label>

      {err && <p className="text-[11px] text-red-600 dark:text-red-400">{err}</p>}

      <button type="submit" disabled={saving || !playerId || !ageOk}
        className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed">
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
        הוספה לסגל
      </button>
    </form>
  )
}
