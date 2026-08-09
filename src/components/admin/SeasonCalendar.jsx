import { useState, useEffect, useMemo } from "react"
import { CalendarDays, Plus, Trash2, ChevronRight, ChevronLeft, AlertTriangle, Loader2, Sparkles } from "lucide-react"
import { motion } from "framer-motion"
import {
  getSeasons, createPlannedSeason, getSeasonGames,
  createGame, updateGame, deleteGame, getTeams,
} from "@/lib/api"
import { getVenues } from "@/lib/venues"
import TeamLogo from "@/components/TeamLogo"

/**
 * Season calendar — where the league manager lays out a season's fixtures.
 *
 * Its reason for existing is the planned season: a season can be created and
 * scheduled into before it starts, and everything drafted here is invisible to
 * users (the games RLS policy only admits the current season). Closing the
 * running season promotes the planned one, so these fixtures go live exactly as
 * drafted — nothing is copied or re-entered.
 *
 * The Israeli week starts on Sunday, so the grid does too.
 */

const DAY_LABELS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"]
const MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
]

/** Local Y-M-D key. Never use toISOString here — it shifts the day in UTC+3. */
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

const hhmm = (iso) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

export default function SeasonCalendar() {
  const [seasons, setSeasons] = useState([])
  const [seasonId, setSeasonId] = useState("")
  const [games, setGames] = useState([])
  const [teams, setTeams] = useState([])
  const [venues, setVenues] = useState([])
  const [cursor, setCursor] = useState(() => new Date())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [draftDay, setDraftDay] = useState(null)
  const [newSeason, setNewSeason] = useState({ open: false, name: "", startsOn: "" })

  const season = seasons.find(s => s.id === seasonId) || null

  useEffect(() => { boot() }, [])
  useEffect(() => { if (seasonId) loadGames(seasonId) }, [seasonId])

  async function boot() {
    setLoading(true)
    try {
      const [ss, ts, vs] = await Promise.all([getSeasons(), getTeams(), getVenues()])
      setSeasons(ss)
      setTeams(ts)
      setVenues(vs)
      const preferred = ss.find(s => s.status === "planned") || ss.find(s => s.status === "active")
      if (preferred) {
        setSeasonId(preferred.id)
        if (preferred.starts_on) setCursor(new Date(preferred.starts_on + "T00:00:00"))
      }
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function loadGames(id) {
    try { setGames(await getSeasonGames(id)) }
    catch (e) { setError(e.message) }
  }

  const teamsById = useMemo(() => Object.fromEntries(teams.map(t => [t.id, t])), [teams])

  // Games bucketed by local day, so the grid is a lookup rather than a scan.
  const byDay = useMemo(() => {
    const map = {}
    for (const g of games) (map[dayKey(new Date(g.game_date))] ||= []).push(g)
    for (const k of Object.keys(map)) map[k].sort((a, b) => new Date(a.game_date) - new Date(b.game_date))
    return map
  }, [games])

  /**
   * Two mistakes are easy to make when laying out a season by hand: giving a
   * team two fixtures on one day, and double-booking a court. Both are flagged
   * rather than blocked — a double-header may be deliberate.
   */
  const conflicts = useMemo(() => {
    const out = {}
    for (const [key, list] of Object.entries(byDay)) {
      const seenTeam = new Map()
      const seenSlot = new Map()
      for (const g of list) {
        for (const tid of [g.home_team_id, g.away_team_id]) {
          if (!tid) continue
          if (seenTeam.has(tid)) {
            (out[key] ||= []).push(`${teamsById[tid]?.name || "קבוצה"} משחקת פעמיים באותו יום`)
          }
          seenTeam.set(tid, true)
        }
        const slot = `${g.venue || ""}|${hhmm(g.game_date)}`
        if (g.venue && seenSlot.has(slot)) {
          (out[key] ||= []).push(`${g.venue} תפוס פעמיים ב-${hhmm(g.game_date)}`)
        }
        seenSlot.set(slot, true)
      }
    }
    // de-dupe repeated messages on the same day
    for (const k of Object.keys(out)) out[k] = [...new Set(out[k])]
    return out
  }, [byDay, teamsById])

  const perTeam = useMemo(() => {
    const counts = Object.fromEntries(teams.map(t => [t.id, 0]))
    for (const g of games) {
      if (g.home_team_id in counts) counts[g.home_team_id]++
      if (g.away_team_id in counts) counts[g.away_team_id]++
    }
    return counts
  }, [games, teams])

  // Leading blanks so the 1st lands under the right weekday.
  const grid = useMemo(() => {
    const y = cursor.getFullYear(), m = cursor.getMonth()
    const first = new Date(y, m, 1)
    const days = new Date(y, m + 1, 0).getDate()
    return [...Array(first.getDay()).fill(null), ...Array.from({ length: days }, (_, i) => new Date(y, m, i + 1))]
  }, [cursor])

  async function addFixture(form) {
    setBusy(true); setError(null)
    try {
      const [hh, mm] = (form.time || "20:00").split(":").map(Number)
      const when = new Date(form.date)
      when.setHours(hh, mm, 0, 0)
      await createGame({
        home_team_id: form.home_team_id,
        away_team_id: form.away_team_id,
        game_date: when.toISOString(),
        venue: form.venue || null,
        status: "scheduled",
        game_type: form.game_type || "ליגה",
        // Explicit: the column defaults to the CURRENT season, which is wrong
        // when drafting into a planned one.
        season_id: seasonId,
      })
      setDraftDay(null)
      await loadGames(seasonId)
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  async function removeFixture(id) {
    if (!confirm("למחוק את המשחק מהלוח?")) return
    setBusy(true)
    try { await deleteGame(id); await loadGames(seasonId) }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  async function moveTime(g, time) {
    const [hh, mm] = time.split(":").map(Number)
    const when = new Date(g.game_date)
    when.setHours(hh, mm, 0, 0)
    setBusy(true)
    try { await updateGame(g.id, { game_date: when.toISOString() }); await loadGames(seasonId) }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  async function handleCreateSeason() {
    if (!newSeason.name.trim()) return
    setBusy(true); setError(null)
    try {
      const id = await createPlannedSeason(newSeason.name.trim(), newSeason.startsOn || null)
      const ss = await getSeasons()
      setSeasons(ss); setSeasonId(id)
      if (newSeason.startsOn) setCursor(new Date(newSeason.startsOn + "T00:00:00"))
      setNewSeason({ open: false, name: "", startsOn: "" })
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
      </div>
    )
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* Season picker */}
      <div className="card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[190px]">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">עונה</label>
            <select value={seasonId} onChange={e => setSeasonId(e.target.value)}
              aria-label="בחירת עונה" className="filter-input w-full">
              {seasons.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.status === "planned" ? " — בתכנון" : s.status === "archived" ? " — הסתיימה" : " — פעילה"}
                </option>
              ))}
            </select>
          </div>
          <button onClick={() => setNewSeason(n => ({ ...n, open: !n.open }))}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-brand/25 text-brand dark:text-brand-light text-sm font-semibold hover:bg-brand/[0.06] transition-colors">
            <Plus className="w-4 h-4" /> עונה חדשה בתכנון
          </button>
        </div>

        {newSeason.open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs font-semibold text-slate-500 mb-1 block">שם העונה</label>
              <input value={newSeason.name} onChange={e => setNewSeason(n => ({ ...n, name: e.target.value }))}
                className="filter-input w-full" placeholder="2026-27" dir="ltr" />
            </div>
            <div className="min-w-[150px]">
              <label className="text-xs font-semibold text-slate-500 mb-1 block">תאריך פתיחה</label>
              <input type="date" value={newSeason.startsOn}
                onChange={e => setNewSeason(n => ({ ...n, startsOn: e.target.value }))}
                className="filter-input w-full" dir="ltr" />
            </div>
            <button onClick={handleCreateSeason} disabled={busy || !newSeason.name.trim()}
              className="px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors disabled:opacity-50">
              צור
            </button>
          </motion.div>
        )}

        {season?.status === "planned" && (
          <div className="mt-3 flex items-start gap-2 text-xs bg-brand/[0.06] border border-brand/20 rounded-lg p-2.5">
            <Sparkles className="w-4 h-4 text-brand shrink-0 mt-0.5" />
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              עונה בתכנון — המשחקים כאן <strong>אינם גלויים לאף אחד</strong> מלבד מנהלי המערכת ומנהלי הליגה.
              כשתסגרו את העונה הנוכחית ותפתחו את <strong>{season.name}</strong>, כל הלוח הזה יעלה לאוויר כמו שהוא.
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="card p-3 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Month navigation + totals */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1">
            <button onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
              aria-label="חודש קודם"
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="font-bold text-sm text-slate-900 dark:text-white min-w-[130px] text-center">
              {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
            </span>
            <button onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
              aria-label="חודש הבא"
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
          <span className="text-xs text-slate-400">
            {games.length} משחקים בעונה
          </span>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAY_LABELS.map(d => (
            <div key={d} className="text-center text-[11px] font-bold text-slate-400 py-1">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {grid.map((day, i) => {
            if (!day) return <div key={`blank-${i}`} />
            const key = dayKey(day)
            const list = byDay[key] || []
            const dayConflicts = conflicts[key] || []
            return (
              <div key={key}
                className={`min-h-[86px] rounded-lg border p-1.5 transition-colors ${
                  dayConflicts.length
                    ? "border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-900/10"
                    : "border-slate-100 dark:border-slate-700/60 hover:border-slate-200 dark:hover:border-slate-600"
                }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold text-slate-400">{day.getDate()}</span>
                  <button onClick={() => setDraftDay(day)}
                    aria-label={`הוספת משחק ל-${day.getDate()}/${day.getMonth() + 1}`}
                    className="p-0.5 rounded text-slate-300 hover:text-brand hover:bg-brand/10 transition-colors">
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                {dayConflicts.length > 0 && (
                  <div className="flex items-center gap-1 mb-1" title={dayConflicts.join(" · ")}>
                    <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="text-[9px] text-amber-600 dark:text-amber-400 truncate">{dayConflicts[0]}</span>
                  </div>
                )}

                <div className="space-y-1">
                  {list.map(g => (
                    <div key={g.id}
                      className="group rounded bg-slate-50 dark:bg-slate-800/70 px-1.5 py-1 text-[10px] leading-tight">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-slate-500 dark:text-slate-400" dir="ltr">{hhmm(g.game_date)}</span>
                        <button onClick={() => removeFixture(g.id)}
                          aria-label="מחיקת משחק"
                          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <TeamLogo team={teamsById[g.home_team_id]} className="w-3 h-3 shrink-0" />
                        <span className="truncate text-slate-700 dark:text-slate-200">
                          {teamsById[g.home_team_id]?.name || "?"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <TeamLogo team={teamsById[g.away_team_id]} className="w-3 h-3 shrink-0" />
                        <span className="truncate text-slate-500 dark:text-slate-400">
                          {teamsById[g.away_team_id]?.name || "?"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Fixtures per team — the quickest way to spot who is under-scheduled */}
      <div className="card p-4">
        <h4 className="font-bold text-sm text-slate-900 dark:text-white mb-3 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-brand" /> משחקים לכל קבוצה בעונה
        </h4>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {teams.map(t => (
            <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <TeamLogo team={t} className="w-5 h-5 shrink-0" />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{t.name}</span>
              </div>
              <span className={`text-xs font-extrabold tabular-nums ${
                perTeam[t.id] ? "text-slate-900 dark:text-white" : "text-amber-500"
              }`}>{perTeam[t.id] || 0}</span>
            </div>
          ))}
        </div>
      </div>

      {draftDay && (
        <FixtureDraft day={draftDay} teams={teams} venues={venues} busy={busy}
          onCancel={() => setDraftDay(null)} onSave={addFixture} />
      )}
    </div>
  )
}

function FixtureDraft({ day, teams, venues, busy, onCancel, onSave }) {
  const [form, setForm] = useState({
    date: day, home_team_id: "", away_team_id: "", time: "20:00", venue: "", game_type: "ליגה",
  })
  const sameTeam = form.home_team_id && form.home_team_id === form.away_team_id
  const ready = form.home_team_id && form.away_team_id && !sameTeam

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        className="relative card w-full max-w-sm p-5 shadow-2xl space-y-3">
        <h4 className="font-bold text-sm text-slate-900 dark:text-white">
          משחק חדש — {day.getDate()}/{day.getMonth() + 1}/{day.getFullYear()}
        </h4>

        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">קבוצת בית</label>
          <select value={form.home_team_id} onChange={e => setForm(f => ({ ...f, home_team_id: e.target.value }))}
            aria-label="קבוצת בית" className="filter-input w-full">
            <option value="">בחר/י קבוצה…</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">קבוצת חוץ</label>
          <select value={form.away_team_id} onChange={e => setForm(f => ({ ...f, away_team_id: e.target.value }))}
            aria-label="קבוצת חוץ" className="filter-input w-full">
            <option value="">בחר/י קבוצה…</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {sameTeam && <p className="text-[11px] text-red-500 mt-1">אי אפשר לשבץ קבוצה מול עצמה</p>}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">שעה</label>
            <input type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
              aria-label="שעת המשחק" className="filter-input w-full" dir="ltr" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">סוג</label>
            <select value={form.game_type} onChange={e => setForm(f => ({ ...f, game_type: e.target.value }))}
              aria-label="סוג משחק" className="filter-input w-full">
              <option value="ליגה">ליגה</option>
              <option value="פלייאוף">פלייאוף</option>
              <option value="ידידותי">ידידותי</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">מגרש</label>
          <select value={form.venue} onChange={e => setForm(f => ({ ...f, venue: e.target.value }))}
            aria-label="מגרש" className="filter-input w-full">
            <option value="">ללא</option>
            {venues.map(v => <option key={v.id} value={v.name}>{v.name}{v.city ? ` · ${v.city}` : ""}</option>)}
          </select>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={() => onSave(form)} disabled={!ready || busy}
            className="flex-1 px-4 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors disabled:opacity-50">
            {busy ? "שומר…" : "הוסף לוח"}
          </button>
          <button onClick={onCancel}
            className="px-4 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
            ביטול
          </button>
        </div>
      </motion.div>
    </div>
  )
}
