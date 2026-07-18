import { useState } from "react"
import { Plus, X, Loader2 } from "lucide-react"
import TeamLogo from "@/components/TeamLogo"
import { inviteTeamToTournament, removeTournamentTeam } from "@/lib/tournaments"

const STATUS = {
  invited:  { l: "הוזמנה", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  accepted: { l: "אישרה", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  declined: { l: "דחתה", cls: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400" },
}

/**
 * Manager panel (Package 2) shown on the tournament page to admins/league-managers.
 * Invite teams (filtered to the tournament's age group), see each team's response,
 * and remove. onChange() lets the parent refetch the tournament_teams rows.
 */
export default function TournamentTeamsManager({ tournamentId, ageGroup, rows = [], teams = [], teamsMap = {}, onChange }) {
  const [teamId, setTeamId] = useState("")
  const [busy, setBusy] = useState(false)

  const invitedIds = new Set(rows.map(r => r.team_id))
  const choices = teams.filter(t =>
    !invitedIds.has(t.id) &&
    (!ageGroup || (Array.isArray(t.age_groups) ? t.age_groups.includes(ageGroup) : true))
  )

  const invite = async () => {
    if (!teamId) return
    setBusy(true)
    try { await inviteTeamToTournament(tournamentId, teamId); setTeamId(""); await onChange?.() }
    catch (e) { alert('שגיאה: ' + (e.message || e)) } finally { setBusy(false) }
  }
  const remove = async (id) => {
    setBusy(true)
    try { await removeTournamentTeam(id); await onChange?.() }
    catch (e) { alert('שגיאה: ' + (e.message || e)) } finally { setBusy(false) }
  }

  return (
    <div className="card p-5 space-y-3 ring-1 ring-brand/20">
      <h2 className="text-sm font-bold text-slate-900 dark:text-white">ניהול קבוצות בטורניר</h2>
      <div className="flex items-center gap-2">
        <select value={teamId} onChange={e => setTeamId(e.target.value)}
          className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand/30">
          <option value="">הזמן קבוצה…</option>
          {choices.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button onClick={invite} disabled={!teamId || busy}
          className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg bg-brand text-white hover:bg-brand-hover transition-colors disabled:opacity-50 shrink-0">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} הזמן
        </button>
      </div>
      {choices.length === 0 && rows.length === 0 && (
        <p className="text-xs text-slate-400">אין קבוצות מתאימות בקטגוריית הגיל של הטורניר. פתחו קבוצות עם קטגוריית הגיל הזו.</p>
      )}
      {rows.length > 0 && (
        <div className="space-y-1.5">
          {rows.map(r => {
            const team = r.teams || teamsMap[r.team_id]
            const s = STATUS[r.status] || STATUS.invited
            return (
              <div key={r.id} className="flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/60 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <TeamLogo team={team} size={6} />
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{team?.name || "—"}</span>
                  <span className={`stat-pill ${s.cls}`}>{s.l}</span>
                </div>
                <button onClick={() => remove(r.id)} disabled={busy}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
