import { BRAND_ORANGE } from '@/lib/brand'
import { Link, useLocation } from "react-router-dom"
import { useState } from "react"
import {
  UserCheck,
  Menu,
  X,
  LogOut,
  UserCircle
} from "lucide-react"
import { Rink, Standings, Crossed, Teams, Player, Whistle, Stats, Camera, Edit, Trophy, Clipboard } from "./components/icons/HockeyIcons"
import { useAuth } from "./lib/AuthContext"
import AuthModal from "./components/AuthModal"
import OnboardingModal from "./components/OnboardingModal"
import NotificationBell from "./components/NotificationBell"
import ChatDrawer from "./components/ChatDrawer"

// Nav uses the hockey icons in `mono`, so the brand-color puck accent becomes
// currentColor and stays visible on the active tab's solid-brand background.
const NavRink = (p) => <Rink mono {...p} />
const NavStandings = (p) => <Standings mono {...p} />
const NavGames = (p) => <Crossed mono {...p} />
const NavTeams = (p) => <Teams mono {...p} />
const NavPlayers = (p) => <Player mono {...p} />
const NavWhistle = (p) => <Whistle mono {...p} />
const NavStats = (p) => <Stats mono {...p} />
const NavCamera = (p) => <Camera mono {...p} />
const NavEdit = (p) => <Edit mono {...p} />
const NavTrophy = (p) => <Trophy mono {...p} />
const NavClipboard = (p) => <Clipboard mono {...p} />

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
  const { user, isAdmin, hasRole, coachTeamIds, isJudgeRole, isContentEditor, profile, signOut, openAuth } = useAuth()

  const navItems = [
    { title: "בית", url: "/", icon: NavRink },
    { title: "טבלה", url: "/standings", icon: NavStandings },
    { title: "משחקים", url: "/games", icon: NavGames },
    { title: "סטטיסטיקות", url: "/statistics", icon: NavStats },
    { title: "קבוצות", url: "/teams", icon: NavTeams },
    { title: "שחקנים", url: "/players", icon: NavPlayers },
    // Media / content-editor entry: plain users & admins keep "מדיה"; content
    // editors get "יוצרי תוכן" instead; admins see BOTH.
    ...((!isContentEditor || isAdmin) ? [{ title: "מדיה", url: "/media", icon: NavCamera }] : []),
    ...((isContentEditor || isAdmin) ? [{ title: "יוצרי תוכן", url: "/creators", icon: NavEdit }] : []),
    { title: "Final Four", url: "/final-four", icon: NavTrophy },
    // Archive lives in the management screen's season tab (/admin), not the main nav.
    ...(hasRole("judge") ? [{ title: "שיפוט", url: "/judge", icon: NavWhistle }] : []),
    ...((isAdmin || coachTeamIds.length > 0 || isJudgeRole) ? [{ title: "ניהול", url: "/admin", icon: NavClipboard }] : []),
  ]

  const isActivePage = (url) =>
    url === "/"
      ? location.pathname === "/"
      : location.pathname === url || location.pathname.startsWith(url + "/")

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950" dir="rtl">
      {/* Top header bar */}
      <header className="sticky top-0 z-50 bg-surface-nav/80 backdrop-blur-lg border-b border-line-header">
        <div className="flex items-center gap-3 px-4 sm:px-6 h-16">
          {/* RTL start (right): logo + wordmark */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <img src="/logos/main-logo.png" alt="ליגת הוקי" className="size-10 rounded-xl object-cover ring-1 ring-line shadow-sm" />
            <div className="leading-none">
              <h1 className="text-xl font-black text-fg-strong tracking-tight">ליגת הוקי</h1>
              <span className="mt-1 inline-flex items-center rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand-strong dark:text-brand-light">עונת 2025-26</span>
            </div>
          </Link>

          {/* Inline nav (xl+). Below xl the icon-rich hamburger menu is used, so
              the widened icon+text items never crowd the header. `min-w-0` +
              `overflow-x-auto` lets a long nav (e.g. managers, who get extra
              ניהול/שיפוט/יוצרי תוכן items) scroll horizontally inside the header
              instead of overflowing it. `mx-auto` centers the row when it fits
              and collapses to 0 when it doesn't, so no item is ever clipped. */}
          <nav className="hidden xl:flex flex-1 min-w-0 overflow-x-auto nav-scroll">
            <div className="flex items-center gap-1 mx-auto">
              {navItems.map((item) => (
                <Link
                  key={item.title}
                  to={item.url}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
                    isActivePage(item.url)
                      ? "bg-brand/10 text-orange-600 dark:text-orange-400"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <item.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  {item.title}
                </Link>
              ))}
            </div>
          </nav>

          {/* RTL end (left): auth (desktop) / hamburger (mobile).
              Dark-mode toggle lives on the profile page (/me), not here. */}
          <div className="flex items-center gap-1.5 ms-auto xl:ms-0">
            {/* Notifications bell — visible on all sizes for signed-in users, next to the avatar */}
            {user && <NotificationBell />}

            {/* Auth (xl+) */}
            <div className="hidden xl:flex items-center gap-2">
              {user ? (
                <>
                  <Link
                    to="/me"
                    title="הדף שלי"
                    aria-label="הדף שלי"
                    className="rounded-full shrink-0 hover:ring-2 hover:ring-orange-300 dark:hover:ring-orange-500/40 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                  >
                    <NavAvatar profile={profile} email={user.email} className="w-8 h-8" />
                  </Link>
                  <button
                    onClick={() => signOut()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
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

            {/* Hamburger (below xl) */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="xl:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              aria-label="תפריט"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div className="xl:hidden fixed inset-0 z-50 bg-white dark:bg-slate-900 pt-16 flex flex-col" dir="rtl">
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="absolute top-4 end-4 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
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
                className={`flex items-center gap-3 px-4 py-3.5 rounded-xl transition-colors ${
                  isActivePage(item.url)
                    ? "bg-brand text-white shadow-md shadow-brand/25"
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
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="min-h-screen">
        {children}
      </main>

      {/* Auth (login / signup) modal */}
      <AuthModal />

      {/* First-run prompt to link the account to a player profile */}
      <OnboardingModal />

      {/* Members-only chat / mailbox (self-gates to members) */}
      <ChatDrawer />
    </div>
  )
}
