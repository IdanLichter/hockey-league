import { BrowserRouter as Router, Route, Routes } from 'react-router-dom'
import Layout from './Layout'
import Home from './pages/Home'
import Games from './pages/Games'
import Statistics from './pages/Statistics'
import Teams from './pages/Teams'
import Players from './pages/Players'
import FinalFour from './pages/FinalFour'

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/games" element={<Games />} />
          <Route path="/statistics" element={<Statistics />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/players" element={<Players />} />
          <Route path="/final-four" element={<FinalFour />} />
        </Routes>
      </Layout>
    </Router>
  )
}

export default App
