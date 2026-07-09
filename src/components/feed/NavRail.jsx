import { Link, useLocation } from "react-router-dom"
import { Home, Trophy, Calendar, BarChart3, Users, UserCheck, Archive } from "lucide-react"

const NAV_ITEMS = [
  { title: "בית", to: "/", icon: Home },
  { title: "טבלה", to: "/standings", icon: Trophy },
  { title: "משחקים", to: "/games", icon: Calendar },
  { title: "סטטיסטיקות", to: "/statistics", icon: BarChart3 },
  { title: "קבוצות", to: "/teams", icon: Users },
  { title: "שחקנים", to: "/players", icon: UserCheck },
  { title: "Final Four", to: "/final-four", icon: Trophy },
  { title: "ארכיון", to: "/archive", icon: Archive },
]

export default function NavRail() {
  const { pathname } = useLocation()

  const isActive = (to) =>
    to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(to + "/")

  return (
    <nav className="card p-2 space-y-0.5">
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.to)
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
              active
                ? "bg-orange-500 text-white shadow-sm shadow-orange-500/25"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/60 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <item.icon
              size={18}
              className={active ? "" : "text-slate-400 dark:text-slate-500"}
            />
            <span>{item.title}</span>
          </Link>
        )
      })}
    </nav>
  )
}
