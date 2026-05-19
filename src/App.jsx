import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom'
import { useState, useEffect, createContext, useContext } from 'react'
import Layout from './Layout'
import Home from './pages/Home'
import Games from './pages/Games'
import Statistics from './pages/Statistics'
import Teams from './pages/Teams'
import Players from './pages/Players'
import FinalFour from './pages/FinalFour'
import Admin from './pages/Admin'
import ArchivePage from './pages/Archive'
import { getLeagueSetting } from './lib/api'

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

  const homePage = seasonMode === 'final_four' ? <FinalFour /> : <Home />

  return (
    <SeasonModeContext.Provider value={{ seasonMode, setSeasonMode }}>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={homePage} />
            <Route path="/standings" element={<Home />} />
            <Route path="/games" element={<Games />} />
            <Route path="/statistics" element={<Statistics />} />
            <Route path="/teams" element={<Teams />} />
            <Route path="/players" element={<Players />} />
            <Route path="/final-four" element={<FinalFour />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/archive" element={<ArchivePage />} />
            <Route path="/archive/:seasonId" element={<ArchivePage />} />
          </Routes>
        </Layout>
      </Router>
    </SeasonModeContext.Provider>
  )
}

export default App
