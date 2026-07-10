import { BRAND_ORANGE } from '@/lib/brand'
import { Link, useLocation } from "react-router-dom"
import { useState } from "react"
import {
  Trophy,
  UserCheck,
  BarChart3,
  Menu,
  X,
  Sun,
  Moon,
  Shield,
  Archive,
  Camera,
  LogOut,
  UserCircle
} from "lucide-react"
import { Rink, Standings, Crossed, Teams, Player, Whistle } from "./components/icons/HockeyIcons"
import { useTheme } from "./lib/ThemeContext"
import { useAuth } from "./lib/AuthContext"
import AuthModal from "./components/AuthModal"

// Nav uses the hockey icons in `mono`, so their orange accent becomes currentColor
// and stays visible on the active tab's solid-orange background.
const NavRink = (p) => <Rink mono {...p} />
const NavStandings = (p) => <Standings mono {...p} />
const NavGames = (p) => <Crossed mono {...p} />
const NavTeams = (p) => <Teams mono {...p} />
const NavPlayers = (p) => <Player mono {...p} />
const NavWhistle = (p) => <Whistle mono {...p} />

/**
 * Navbar avatar with three states (mirrors the /me header + feed avatars):
 *   1. profile image set        → the uploaded picture
 *   2. linked to a player       → circle in the player's team color + initial
 *   3. guest (neither)          → neutral gray generic user icon
 */
function NavAvatar({ profile, email, className = "w-8 h-8" }) {
  const name = profile?.display_name || profile?.player?.first_name || email || ""
  const initial = name.trim().charAt(0).toUpperCase()

  if (profile?.avatar_url) {
    return <img src={profile.avatar_url} alt="" className={`${className} rounded-full object-cover shrink-0`} />
  }
  if (profile?.player_id) {
    return (
      <div
        className={`${className} rounded-full shrink-0 flex items-center justify-center text-white text-sm font-bold`}
        style={{ backgroundColor: profile.teamColor || BRAND_ORANGE }}
      >
        {initial || <UserCircle className="w-1/2 h-1/2" />}
      </div>
    )
  }
  return (
    <div className={`${className} rounded-full shrink-0 flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500`}>
      <UserCircle className="w-3/5 h-3/5" />
    </div>
  )
}

export default function Layout({ children }) {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { dark, toggle } = useTheme()
  const { user, isAdmin, hasRole, coachTeamIds, profile, signOut, openAuth } = useAuth()

  const navItems = [
    { title: "בית", url: "/", icon: NavRink },
    { title: "טבלה", url: "/standings", icon: NavStandings },
    { title: "משחקים", url: "/games", icon: NavGames },
    { title: "סטטיסטיקות", url: "/statistics", icon: BarChart3 },
    { title: "קבוצות", url: "/teams", icon: NavTeams },
    { title: "שחקנים", url: "/players", icon: NavPlayers },
    { title: "מדיה", url: "/media", icon: Camera },
    { title: "Final Four", url: "/final-four", icon: Trophy },
    { title: "ארכיון", url: "/archive", icon: Archive },
    ...(hasRole("judge") ? [{ title: "שיפוט", url: "/judge", icon: NavWhistle }] : []),
    ...((isAdmin || coachTeamIds.length > 0) ? [{ title: "ניהול", url: "/admin", icon: Shield }] : []),
  ]

  const isActivePage = (url) =>
    url === "/"
      ? location.pathname === "/"
      : location.pathname === url || location.pathname.startsWith(url + "/")

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950" dir="rtl">
      {/* Top header bar */}
      <header className="sticky top-0 z-50 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3 px-4 sm:px-6 h-16">
          {/* RTL start (right): logo + title */}
          <Link to="/" className="flex items-center gap-3 shrink-0">
            <img src="/logos/main-logo.png" alt="ליגת הוקי" className="w-10 h-10 rounded-lg object-cover" />
            <div className="leading-tight">
              <h1 className="text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">ליגת הוקי</h1>
              <span className="text-xs sm:text-sm font-bold text-orange-600 dark:text-orange-400">עונת 2025-26</span>
            </div>
          </Link>

          {/* Inline nav (lg+) */}
          <nav className="hidden lg:flex items-center gap-1 flex-1 justify-center">
            {navItems.map((item) => (
              <Link
                key={item.title}
                to={item.url}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  isActivePage(item.url)
                    ? "bg-orange-500/10 text-orange-600 dark:text-orange-400"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {item.title}
              </Link>
            ))}
          </nav>

          {/* RTL end (left): theme + auth (desktop) / hamburger (mobile) */}
          <div className="flex items-center gap-1.5 mr-auto lg:mr-0">
            <button
              onClick={toggle}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
              aria-label={dark ? "מצב בהיר" : "מצב כהה"}
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Auth (lg+) */}
            <div className="hidden lg:flex items-center gap-2">
              {user ? (
                <>
                  <Link
                    to="/me"
                    title="הדף שלי"
                    aria-label="הדף שלי"
                    className="rounded-full shrink-0 hover:ring-2 hover:ring-orange-300 dark:hover:ring-orange-500/40 transition-all"
                  >
                    <NavAvatar profile={profile} email={user.email} className="w-8 h-8" />
                  </Link>
                  <button
                    onClick={() => signOut()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" /> התנתק
                  </button>
                </>
              ) : (
                <button
                  onClick={openAuth}
                  className="btn-primary btn-sm"
                >
                  התחבר
                </button>
              )}
            </div>

            {/* Hamburger (mobile) */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
              aria-label="תפריט"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-white dark:bg-slate-900 pt-16 flex flex-col" dir="rtl">
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="absolute top-4 left-4 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400"
            aria-label="סגור"
          >
            <X className="w-5 h-5" />
          </button>

          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
            {navItems.map((item) => (
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

          {/* Footer actions */}
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
            {user ? (
              <>
                <Link
                  to="/me"
                  onClick={() => setMobileMenuOpen(false)}
                  className="btn-primary w-full py-2.5"
                >
                  <NavAvatar profile={profile} email={user.email} className="w-6 h-6 ring-2 ring-white/50" /> הדף שלי
                </Link>
                <button
                  onClick={() => { signOut(); setMobileMenuOpen(false) }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-colors"
                >
                  <LogOut className="w-4 h-4" /> התנתק
                </button>
              </>
            ) : (
              <button
                onClick={() => { openAuth(); setMobileMenuOpen(false) }}
                className="btn-primary w-full py-2.5"
              >
                התחבר
              </button>
            )}
            <button
              onClick={toggle}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-colors"
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {dark ? "מצב בהיר" : "מצב כהה"}
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="min-h-screen">
        {children}
      </main>

      {/* Auth (login / signup) modal */}
      <AuthModal />
    </div>
  )
}
