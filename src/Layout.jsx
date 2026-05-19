import { Link, useLocation } from "react-router-dom"
import { useState } from "react"
import {
  Trophy,
  Users,
  UserCheck,
  Calendar,
  BarChart3,
  Menu,
  X,
  Sun,
  Moon,
  Shield
} from "lucide-react"
import { useTheme } from "./lib/ThemeContext"

const navigationItems = [
  { title: "טבלה", url: "/", icon: Trophy, description: "דירוג ופלייאוף" },
  { title: "משחקים", url: "/games", icon: Calendar, description: "לוח ותוצאות" },
  { title: "סטטיסטיקות", url: "/statistics", icon: BarChart3, description: "נתוני ביצועים" },
  { title: "קבוצות", url: "/teams", icon: Users, description: "כל הקבוצות" },
  { title: "שחקנים", url: "/players", icon: UserCheck, description: "פרופיל שחקנים" },
  { title: "Final Four", url: "/final-four", icon: Trophy, description: "שלב הגמר" },
]

export default function Layout({ children }) {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { dark, toggle } = useTheme()
  const allNavItems = [
    ...navigationItems,
    { title: "ניהול", url: "/admin", icon: Shield, description: "דף מנהלים" }
  ]

  const isActivePage = (url) => location.pathname === url

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950" dir="rtl">
      {/* Desktop Sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:right-0 lg:z-50 lg:block lg:w-64 lg:overflow-y-auto lg:bg-white lg:dark:bg-slate-900 lg:border-l lg:border-slate-200 lg:dark:border-slate-800">
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-3 px-5 py-6">
            <img src="/logos/main-logo.png" alt="ליגת הוקי" className="w-11 h-11 rounded-xl object-cover" />
            <div>
              <h1 className="text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
                ליגת הוקי
              </h1>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">עונת 2024-25</p>
            </div>
          </div>

          <div className="h-px bg-slate-100 dark:bg-slate-800 mx-5" />

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-0.5">
            {allNavItems.map((item) => (
              <Link
                key={item.title}
                to={item.url}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
                  isActivePage(item.url)
                    ? "bg-orange-500 text-white shadow-md shadow-orange-500/25"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <item.icon className={`w-[18px] h-[18px] ${
                  isActivePage(item.url) ? "" : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{item.title}</div>
                  <div className={`text-[11px] leading-tight ${
                    isActivePage(item.url) ? "text-orange-100" : "text-slate-400 dark:text-slate-500"
                  }`}>
                    {item.description}
                  </div>
                </div>
              </Link>
            ))}
          </nav>

          {/* Footer */}
          <div className="px-3 pb-4 space-y-3">
            <button
              onClick={toggle}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700"
            >
              {dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              {dark ? "מצב בהיר" : "מצב כהה"}
            </button>
            <p className="text-[10px] text-slate-400 dark:text-slate-600 text-center font-medium">
              ליגת רולר הוקי ישראל
            </p>
          </div>
        </div>
      </div>

      {/* Mobile Header */}
      <div className="lg:hidden sticky top-0 z-50">
        <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <img src="/logos/main-logo.png" alt="ליגת הוקי" className="w-8 h-8 rounded-lg object-cover" />
            <div>
              <h1 className="text-sm font-extrabold text-slate-900 dark:text-white leading-none">ליגת הוקי</h1>
              <p className="text-[10px] text-slate-400 font-medium">עונת 2024-25</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={toggle}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400"
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 bg-white dark:bg-slate-900 pt-14">
            <nav className="p-4 space-y-1">
              {allNavItems.map((item) => (
                <Link
                  key={item.title}
                  to={item.url}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all ${
                    isActivePage(item.url)
                      ? "bg-orange-500 text-white shadow-md shadow-orange-500/25"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
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
      <div className="lg:pr-64">
        <main className="min-h-screen">
          {children}
        </main>
      </div>
    </div>
  )
}
