import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { ThemeProvider } from './lib/ThemeContext.jsx'
import { AuthProvider } from './lib/AuthContext.jsx'
import { initAnalytics } from './lib/analytics'
import './index.css'

// Loads GA4 once, before render. No-op (zero network) unless VITE_GA4_ID is set.
initAnalytics()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
