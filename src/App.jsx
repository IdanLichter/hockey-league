import { BrowserRouter as Router, Route, Routes, Navigate, useLocation, useNavigationType } from 'react-router-dom'
import { useState, useEffect, createContext, useContext, lazy, Suspense } from 'react'
import Layout from './Layout'
import RouteSeo from './components/RouteSeo'
import { getLeagueSetting } from './lib/api'

// Route-level code splitting: each page ships as its own chunk, so the home
// page no longer downloads Admin / Judge / poster generator / etc. up front.
const Feed = lazy(() => import('./pages/Feed'))
const Home = lazy(() => import('./pages/Home'))
const Games = lazy(() => import('./pages/Games'))
const GameDetail = lazy(() => import('./pages/GameDetail'))
const Statistics = lazy(() => import('./pages/Statistics'))
const Teams = lazy(() => import('./pages/Teams'))
const TeamDetail = lazy(() => import('./pages/TeamDetail'))
const Players = lazy(() => import('./pages/Players'))
const PlayerDetail = lazy(() => import('./pages/PlayerDetail'))
const Tournaments = lazy(() => import('./pages/Tournaments'))
const TournamentDetail = lazy(() => import('./pages/TournamentDetail'))
const Judge = lazy(() => import('./pages/Judge'))
const JudgeGame = lazy(() => import('./pages/JudgeGame'))
const Admin = lazy(() => import('./pages/Admin'))
const ArchivePage = lazy(() => import('./pages/Archive'))
const Media = lazy(() => import('./pages/Media'))
const ContentCreators = lazy(() => import('./pages/ContentCreators'))
const Profile = lazy(() => import('./pages/Profile'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Privacy = lazy(() => import('./pages/Privacy'))
const MobileApp = lazy(() => import('./pages/MobileApp'))
const Features = lazy(() => import('./pages/Features'))
const NotFound = lazy(() => import('./pages/NotFound'))

const SeasonModeContext = createContext()
export const useSeasonMode = () => useContext(SeasonModeContext)

/**
 * A plain <a href> reload starts at the top; a client-side route change does not
 * — React swaps the page under a scroll offset the user never asked to keep, so
 * following a link from halfway down /guide dropped you halfway down /standings.
 * Reset to the top on every PUSH/REPLACE, and let the browser restore its own
 * position on POP (back/forward) instead of fighting it.
 *
 * A hash (/guide#coach) targets an element that may still be inside a lazy
 * route chunk, so retry for a few frames before giving up.
 */
function ScrollToTop() {
  const { pathname, hash } = useLocation()
  const navType = useNavigationType()

  useEffect(() => {
    if (navType === 'POP') return

    if (hash) {
      let raf, frames = 0
      const jump = () => {
        const el = document.getElementById(decodeURIComponent(hash.slice(1)))
        if (el) return el.scrollIntoView()
        if (frames++ < 60) raf = requestAnimationFrame(jump)
      }
      jump()
      return () => cancelAnimationFrame(raf)
    }

    window.scrollTo(0, 0)
  }, [pathname, hash, navType])

  return null
}

function App() {
  const [seasonMode, setSeasonMode] = useState(null) // 'regular' or 'final_four'
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getLeagueSetting('season_mode')
      .then(val => setSeasonMode(val || 'regular'))
      .catch(() => setSeasonMode('regular'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-brand border-t-transparent" />
      </div>
    )
  }

  return (
    <SeasonModeContext.Provider value={{ seasonMode, setSeasonMode }}>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <RouteSeo />
        <ScrollToTop />
        <Layout>
          <Suspense fallback={
            <div className="flex items-center justify-center min-h-[60vh]">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-brand border-t-transparent" />
            </div>
          }>
          <Routes>
            <Route path="/" element={<Feed />} />
            <Route path="/standings" element={<Home />} />
            <Route path="/games" element={<Games />} />
            <Route path="/games/:id" element={<GameDetail />} />
            <Route path="/statistics" element={<Statistics />} />
            <Route path="/teams" element={<Teams />} />
            <Route path="/teams/:id" element={<TeamDetail />} />
            <Route path="/players" element={<Players />} />
            <Route path="/players/:id" element={<PlayerDetail />} />
            <Route path="/me" element={<Profile />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/app" element={<MobileApp />} />
            <Route path="/guide" element={<Features />} />
            <Route path="/media" element={<Media />} />
            <Route path="/creators" element={<ContentCreators />} />
            <Route path="/tournaments" element={<Tournaments />} />
            <Route path="/tournaments/:id" element={<TournamentDetail />} />
            <Route path="/judge" element={<Judge />} />
            <Route path="/judge/:id" element={<JudgeGame />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/archive" element={<ArchivePage />} />
            <Route path="/archive/:seasonId" element={<ArchivePage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </Layout>
      </Router>
    </SeasonModeContext.Provider>
  )
}

export default App
