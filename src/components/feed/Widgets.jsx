import { Link } from "react-router-dom"
import { Trophy, Calendar, Flame, MapPin, ChevronLeft } from "lucide-react"
import { format } from "date-fns"
import { standingsComparator } from "@/lib/utils"
import TeamLogo from "@/components/TeamLogo"

const medal = (i) =>
  i === 0 ? 'bg-amber-400 text-amber-950' :
  i === 1 ? 'bg-slate-300 dark:bg-slate-500 text-slate-800 dark:text-white' :
  i === 2 ? 'bg-orange-300 dark:bg-orange-700 text-orange-900 dark:text-white' :
  'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'

function WidgetHeader({ icon, title }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-700">
      {icon}
      <h3 className="font-bold text-sm text-slate-900 dark:text-white">{title}</h3>
    </div>
  )
}

function WidgetFooter({ to, label }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-center gap-1 px-4 py-2.5 border-t border-slate-100 dark:border-slate-700 text-xs font-semibold text-orange-600 dark:text-orange-400 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
    >
      {label}
      <ChevronLeft className="w-3.5 h-3.5" />
    </Link>
  )
}

export function StandingsWidget({ teams = [] }) {
  const top = [...teams].sort(standingsComparator).slice(0, 5)
  return (
    <div className="card overflow-hidden">
      <WidgetHeader icon={<Trophy className="w-4 h-4 text-amber-500" />} title="טבלה" />
      <div className="p-3 space-y-1.5">
        {top.length === 0 && (
          <p className="text-center text-xs text-slate-400 dark:text-slate-500 py-4">אין נתונים</p>
        )}
        {top.map((team, i) => (
          <div key={team.id} className="flex items-center gap-2.5 px-1.5 py-1">
            <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${medal(i)}`}>{i + 1}</span>
            <TeamLogo team={team} size={6} />
            <span className="flex-1 min-w-0 truncate text-sm font-semibold text-slate-900 dark:text-white">{team.name}</span>
            <span className="bg-slate-900 dark:bg-orange-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0">{team.points || 0}</span>
          </div>
        ))}
      </div>
      <WidgetFooter to="/standings" label="לטבלה המלאה" />
    </div>
  )
}

export function NextGameWidget({ games = [], teams = [] }) {
  const teamsMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const upcoming = games
    .filter(g => ['scheduled', 'in_progress', 'waiting_result'].includes(g.status))
    .sort((a, b) => new Date(a.game_date) - new Date(b.game_date))
  const next = upcoming[0] || null
  const home = next ? teamsMap[next.home_team_id] : null
  const away = next ? teamsMap[next.away_team_id] : null

  return (
    <div className="card overflow-hidden">
      <WidgetHeader icon={<Calendar className="w-4 h-4 text-blue-500" />} title="המשחק הבא" />
      <div className="p-4">
        {next ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <TeamLogo team={home} size={8} />
                <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{home?.name}</span>
              </div>
              <span className="text-[11px] font-extrabold text-slate-400 dark:text-slate-500 shrink-0">VS</span>
              <div className="flex items-center gap-2 flex-1 min-w-0 flex-row-reverse">
                <TeamLogo team={away} size={8} />
                <span className="text-sm font-semibold text-slate-900 dark:text-white truncate text-left">{away?.name}</span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
              <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{format(new Date(next.game_date), "d/M/yyyy HH:mm")}</span>
              {next.venue && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{next.venue}</span>}
            </div>
          </>
        ) : (
          <p className="text-center text-sm text-slate-500 dark:text-slate-400 py-4">העונה הסתיימה 🏆</p>
        )}
      </div>
      <WidgetFooter to="/games" label="לכל המשחקים" />
    </div>
  )
}

export function LeadersWidget({ players = [], teams = [] }) {
  const teamsMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const top = players
    .filter(p => p.position === 'Field Player' && (p.goals || 0) > 0)
    .sort((a, b) => (b.goals || 0) - (a.goals || 0))
    .slice(0, 5)

  return (
    <div className="card overflow-hidden">
      <WidgetHeader icon={<Flame className="w-4 h-4 text-red-500" />} title="מלכי השערים" />
      <div className="p-3 space-y-1.5">
        {top.length === 0 && (
          <p className="text-center text-xs text-slate-400 dark:text-slate-500 py-4">אין נתונים</p>
        )}
        {top.map((p, i) => (
          <div key={p.id} className="flex items-center gap-2.5 px-1.5 py-1">
            <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${medal(i)}`}>{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{p.first_name} {p.last_name}</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{teamsMap[p.team_id]?.name || '—'}</p>
            </div>
            <span className="bg-red-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0">{p.goals || 0}</span>
          </div>
        ))}
      </div>
      <WidgetFooter to="/statistics" label="לכל הסטטיסטיקות" />
    </div>
  )
}
