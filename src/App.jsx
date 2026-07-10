import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom'
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
const FinalFour = lazy(() => import('./pages/FinalFour'))
const Judge = lazy(() => import('./pages/Judge'))
const JudgeGame = lazy(() => import('./pages/JudgeGame'))
const Admin = lazy(() => import('./pages/Admin'))
const ArchivePage = lazy(() => import('./pages/Archive'))
const Media = lazy(() => import('./pages/Media'))
const Profile = lazy(() => import('./pages/Profile'))
const Privacy = lazy(() => import('./pages/Privacy'))

const SeasonModeContext = createContext()
export const useSeasonMode = () => useContext(SeasonModeContext)

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
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-orange-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <SeasonModeContext.Provider value={{ seasonMode, setSeasonMode }}>
      <Router>
        <RouteSeo />
        <Layout>
          <Suspense fallback={
            <div className="flex items-center justify-center min-h-[60vh]">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-orange-500 border-t-transparent" />
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
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/media" element={<Media />} />
            <Route path="/final-four" element={<FinalFour />} />
            <Route path="/judge" element={<Judge />} />
            <Route path="/judge/:id" element={<JudgeGame />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/archive" element={<ArchivePage />} />
            <Route path="/archive/:seasonId" element={<ArchivePage />} />
          </Routes>
          </Suspense>
        </Layout>
      </Router>
    </SeasonModeContext.Provider>
  )
}

export default App
