import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { getMyAvailability, setMyAvailability, getGameAvailability } from "@/lib/availability"
import { getApprovedMedicalPlayerIds } from "@/lib/medical"
import { getActiveSuspension, removePlayerFromSquad } from "@/lib/squad"
import AddSquadPlayer from "@/components/AddSquadPlayer"
import { Check, X, Loader2, CalendarCheck, AlertTriangle, Ban, UserMinus, Share2 } from "lucide-react"

/**
 * Sheet row 11 — the coach posts the squad to WhatsApp. Plain text, because that is
 * what actually gets read: most players have no account (a reminder in the app reaches
 * a fraction of the roster), so WhatsApp is the channel that reaches everyone.
 * Numbered, goalkeepers marked, non-responders listed last so the coach can chase them.
 */
export function buildSquadMessage({ game, teamName, opponentName, coming, notComing, noReply, nameOf }) {
  const when = game?.game_date
    ? new Date(game.game_date).toLocaleString("he-IL", {
        weekday: "long", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })
    : ""
  const list = (arr) => arr.map((p, i) =>
    `${i + 1}. ${nameOf(p)}${p.position === "Goalkeeper" ? " (שוער)" : ""}`).join("\n")

  const parts = [
    `*סגל ${teamName}*${opponentName ? ` — נגד ${opponentName}` : ""}`,
    [when, game?.venue].filter(Boolean).join(" · "),
    "",
    `*מגיעים (${coming.length}):*`,
    coming.length ? list(coming) : "—",
  ]
  if (notComing.length) parts.push("", `*לא מגיעים (${notComing.length}):*`, list(notComing))
  if (noReply.length) parts.push("", `*טרם הגיבו (${noReply.length}):*`, list(noReply))
  return parts.join("\n")
}

const MED_MSG = "כדי לאשר הגעה יש להעלות בדיקה רפואית ולקבל אישור בתוקף"
const SUSPENDED_MSG = "אינך יכול להירשם: הרחקה בעקבות כרטיס אדום"
const MIN_PLAYERS = 4 // a team wants at least this many outfield + a goalkeeper

/**
 * Availability panel for an upcoming game (#3 / attendance epic).
 *  - A rostered player toggles מגיע / לא מגיע (signing up requires a valid medical).
 *  - Officials (a coach of a team, or an admin) get the full per-team picture:
 *    מגיעים / לא מגיעים / לא הגיבו + indicators (count, <4 warning, no-GK warning).
 *  - A plain player sees only who's coming/not from their OWN team.
 * Team visibility is enforced by RLS; this renders only what the caller may read.
 */
export default function GameAvailability({ game, myPlayerId, officialTeamIds = [], playerTeamId = null, teamsMap = {}, playersMap = {} }) {
  const [myStatus, setMyStatus] = useState(null)
  const [rows, setRows] = useState([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [medOk, setMedOk] = useState(null)
  const [suspension, setSuspension] = useState(null)
  const [err, setErr] = useState(null)

  const canSeeAny = officialTeamIds.length > 0 || !!playerTeamId

  // Re-read the squad after a manual add/remove without reloading the page.
  const refreshRows = () => {
    if (!canSeeAny) return
    getGameAvailability(game.id).then(setRows).catch(() => {})
  }

  useEffect(() => {
    let alive = true
    Promise.all([
      myPlayerId ? getMyAvailability(game.id, myPlayerId) : Promise.resolve(null),
      canSeeAny ? getGameAvailability(game.id) : Promise.resolve([]),
      myPlayerId ? getApprovedMedicalPlayerIds([myPlayerId]) : Promise.resolve(new Set()),
      myPlayerId ? getActiveSuspension(myPlayerId) : Promise.resolve(null),
    ]).then(([mine, all, med, susp]) => {
      if (!alive) return
      setMyStatus(mine)
      setRows(all)
      setMedOk(myPlayerId ? med.has(myPlayerId) : null)
      setSuspension(susp)
      setLoading(false)
    }).catch(() => {
      // Without this the panel stays `loading` forever and silently disappears from the
      // game page on any transient fetch failure.
      if (!alive) return
      setErr("שגיאה בטעינת הזמינות")
      setLoading(false)
    })
    return () => { alive = false }
  }, [game.id, myPlayerId, canSeeAny])

  const choose = async (status) => {
    setErr(null)
    if (status === "available" && medOk === false) { setErr(MED_MSG); return }
    if (status === "available" && suspension) { setErr(SUSPENDED_MSG); return }
    setSaving(true)
    try {
      await setMyAvailability(game.id, status)
      setMyStatus(status)
      if (status === "available") setMedOk(true)
      if (canSeeAny) setRows(await getGameAvailability(game.id))
    } catch (e) {
      const code = e?.message
      setErr(
        code === "no-valid-medical" ? MED_MSG
        : code === "suspended" ? SUSPENDED_MSG
        : code === "not-in-game" ? "אינך שייך לאחת מהקבוצות במשחק זה"
        : "הפעולה נכשלה, נסו שוב"
      )
    } finally { setSaving(false) }
  }

  const removeManual = async (playerId) => {
    setErr(null)
    try { await removePlayerFromSquad(game.id, playerId); refreshRows() }
    catch (e) { setErr(e.message) }
  }

  if ((!myPlayerId && !canSeeAny) || loading) return null

  const rowByPlayer = Object.fromEntries(rows.map(r => [r.player_id, r]))
  const statusByPlayer = Object.fromEntries(rows.map(r => [r.player_id, r.status]))
  const nameOf = (p) => `${p.first_name} ${p.last_name}`.trim()

  // A team's squad is its roster PLUS anyone manually added for it — a loaned
  // goalkeeper or a one-time youth call-up is on neither roster, so filtering
  // players-by-team alone would silently drop him — MINUS anyone lent the other way
  // for this game.
  const rosterOf = (teamId) => {
    const base = Object.values(playersMap).filter(p => {
      if (p.team_id !== teamId) return false
      const row = rowByPlayer[p.id]
      return !(row?.added_by && row.team_id && row.team_id !== teamId)
    })
    const seen = new Set(base.map(p => p.id))
    const manual = rows
      .filter(r => r.added_by && r.team_id === teamId && !seen.has(r.player_id))
      .map(r => playersMap[r.player_id])
      .filter(Boolean)
    return [...base, ...manual]
  }

  // Everyone already answered or added for this game — never offer them again.
  const inSquadIds = new Set(rows.map(r => r.player_id))
  const pickerPlayers = Object.values(playersMap).map(p => ({
    ...p, teamName: teamsMap[p.team_id]?.name || "",
  }))

  const teamsToShow = [
    ...officialTeamIds.map(tid => ({ tid, full: true })),
    ...(playerTeamId && !officialTeamIds.includes(playerTeamId) ? [{ tid: playerTeamId, full: false }] : []),
  ]

  const Col = ({ label, cls, list, canEdit = false }) => (
    <div className="min-w-0">
      <p className={`text-[11px] font-semibold mb-1 ${cls}`}>{label} ({list.length})</p>
      {list.length === 0
        ? <p className="text-[11px] text-slate-400">—</p>
        : list.map(p => {
          const row = rowByPlayer[p.id]
          const manual = !!row?.added_by
          return (
            <p key={p.id} className="flex items-center gap-1 text-xs text-slate-700 dark:text-slate-300">
              <span className="truncate">{nameOf(p)}{p.position === "Goalkeeper" ? " 🧤" : ""}</span>
              {manual && (
                <span title={row.note || "נוסף ידנית"}
                  className="shrink-0 text-[9px] font-bold px-1 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  ידני
                </span>
              )}
              {manual && canEdit && (
                <button onClick={() => removeManual(p.id)} aria-label={`הסרת ${nameOf(p)} מהסגל`}
                  className="shrink-0 text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 transition-colors">
                  <UserMinus className="w-3 h-3" />
                </button>
              )}
            </p>
          )
        })}
    </div>
  )

  return (
    <div className="card p-4 space-y-4">
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
        <CalendarCheck className="w-4 h-4 text-brand" /> זמינות למשחק
      </h3>

      {myPlayerId && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500 dark:text-slate-400">מגיע/ה למשחק?</span>
            <button onClick={() => choose("available")} disabled={saving || medOk === false || !!suspension}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${myStatus === "available" ? "bg-emerald-500 text-white" : "border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"}`}>
              <Check className="w-3.5 h-3.5" /> מגיע/ה
            </button>
            <button onClick={() => choose("unavailable")} disabled={saving}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${myStatus === "unavailable" ? "bg-red-500 text-white" : "border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"}`}>
              <X className="w-3.5 h-3.5" /> לא מגיע/ה
            </button>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
          </div>
          {/* A refusal has to say WHY — a disabled button with no reason reads as a bug. */}
          {suspension && (
            <p className="flex items-center gap-1.5 text-[11px] text-red-600 dark:text-red-400">
              <Ban className="w-3.5 h-3.5 shrink-0" />
              <span>{SUSPENDED_MSG}{suspension.reason ? ` — ${suspension.reason}` : ""}</span>
            </p>
          )}
          {medOk === false && (
            <p className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{MED_MSG} — <Link to="/me" className="font-semibold underline">להעלאה</Link></span>
            </p>
          )}
          {err && <p className="text-[11px] text-red-600 dark:text-red-400">{err}</p>}
        </div>
      )}

      {teamsToShow.map(({ tid, full }) => {
        const roster = rosterOf(tid)
        const coming = roster.filter(p => statusByPlayer[p.id] === "available")
        const notComing = roster.filter(p => statusByPlayer[p.id] === "unavailable")
        const noReply = roster.filter(p => !statusByPlayer[p.id])
        const gkComing = coming.some(p => p.position === "Goalkeeper")
        const tooFew = coming.length < MIN_PLAYERS
        return (
          <div key={tid} className="pt-3 border-t border-slate-100 dark:border-slate-700/50">
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <span className="text-xs font-bold text-slate-900 dark:text-white truncate">{teamsMap[tid]?.name || "קבוצה"}</span>
              {full && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${tooFew ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"}`}>{coming.length} מגיעים</span>
                  {tooFew && <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"><AlertTriangle className="w-3 h-3" /> פחות מ-4</span>}
                  {!gkComing && <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"><AlertTriangle className="w-3 h-3" /> אין שוער</span>}
                </div>
              )}
            </div>
            <div className={`grid gap-3 ${full ? "grid-cols-3" : "grid-cols-2"}`}>
              <Col label="מגיעים" cls="text-emerald-600 dark:text-emerald-400" list={coming} canEdit={full} />
              <Col label="לא מגיעים" cls="text-red-600 dark:text-red-400" list={notComing} canEdit={full} />
              {full && <Col label="לא הגיבו" cls="text-slate-500 dark:text-slate-400" list={noReply} />}
            </div>
            {/* Row 11 — hand the squad to WhatsApp, the channel that actually reaches
                players who have no account. */}
            {full && (
              <button
                onClick={() => {
                  const text = buildSquadMessage({
                    game, teamName: teamsMap[tid]?.name || "הקבוצה",
                    opponentName: teamsMap[tid === game.home_team_id ? game.away_team_id : game.home_team_id]?.name,
                    coming, notComing, noReply, nameOf,
                  })
                  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer")
                }}
                className="mt-2 ms-2 inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-dashed border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors">
                <Share2 className="w-3.5 h-3.5" /> ייצוא לוואטסאפ
              </button>
            )}

            {/* Only a coach of this team (or an admin) builds the squad. */}
            {full && (
              <AddSquadPlayer
                gameId={game.id}
                teamId={tid}
                teamName={teamsMap[tid]?.name || "הקבוצה"}
                players={pickerPlayers}
                excludeIds={inSquadIds}
                onAdded={refreshRows}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
