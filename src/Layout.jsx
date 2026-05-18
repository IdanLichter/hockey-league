import { Link, useLocation } from "react-router-dom"
import { useState } from "react"
import {
  Trophy,
  Users,
  UserCheck,
  Calendar,
  BarChart3,
  Menu,
  X
} from "lucide-react"

const navigationItems = [
  { title: "טבלה", url: "/", icon: Trophy, description: "טבלת הליגה ופלייאוף" },
  { title: "משחקים", url: "/games", icon: Calendar, description: "לוח משחקים ותוצאות" },
  { title: "סטטיסטיקות", url: "/statistics", icon: BarChart3, description: "נתוני ביצועים" },
  { title: "קבוצות", url: "/teams", icon: Users, description: "כל הקבוצות" },
  { title: "שחקנים", url: "/players", icon: UserCheck, description: "פרופיל שחקנים" },
  { title: "Final Four", url: "/final-four", icon: Trophy, description: "שלב הגמר" },
]

export default function Layout({ children }) {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const isActivePage = (url) => location.pathname === url

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-amber-50/30 to-slate-100" dir="rtl">
      {/* Desktop Sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:right-0 lg:z-50 lg:block lg:w-72 lg:overflow-y-auto lg:bg-white/80 lg:backdrop-blur-xl lg:border-l lg:border-slate-200/60">
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-6 py-8 border-b border-slate-200/60">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-600 to-orange-700 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-600/30">
              <Trophy className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                ליגת הוקי
              </h1>
              <p className="text-sm text-slate-500">עונת 2024-25</p>
            </div>
          </div>

          <nav className="flex-1 px-4 py-6 space-y-1">
            {navigationItems.map((item) => (
              <Link
                key={item.title}
                to={item.url}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group ${
                  isActivePage(item.url)
                    ? "bg-gradient-to-r from-orange-600 to-orange-700 text-white shadow-lg shadow-orange-600/30"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <item.icon className={`w-5 h-5 transition-transform duration-300 ${
                  isActivePage(item.url) ? "scale-110" : "group-hover:scale-105"
                }`} />
                <div className="flex-1">
                  <div className="font-semibold">{item.title}</div>
                  <div className={`text-xs ${
                    isActivePage(item.url) ? "text-orange-100" : "text-slate-400"
                  }`}>
                    {item.description}
                  </div>
                </div>
              </Link>
            ))}
          </nav>

          <div className="px-6 py-4 border-t border-slate-200/60">
            <div className="text-xs text-slate-400 text-center">
              עונת 2024-25 • ליגת רולר הוקי
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Header */}
      <div className="lg:hidden">
        <div className="flex items-center justify-between p-3 bg-white/80 backdrop-blur-xl border-b border-slate-200/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-600 to-orange-700 rounded-lg flex items-center justify-center">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-sm font-bold text-slate-900">ליגת הוקי</h1>
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg hover:bg-slate-100"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 bg-white pt-16">
            <nav className="p-4 space-y-1">
              {navigationItems.map((item) => (
                <Link
                  key={item.title}
                  to={item.url}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    isActivePage(item.url)
                      ? "bg-gradient-to-r from-orange-600 to-orange-700 text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-semibold">{item.title}</span>
                </Link>
              ))}
            </nav>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="lg:pr-72">
        <main className="min-h-screen">
          {children}
        </main>
      </div>
    </div>
  )
}
