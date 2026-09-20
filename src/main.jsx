import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { ThemeProvider } from './lib/ThemeContext.jsx'
import { AuthProvider } from './lib/AuthContext.jsx'
import { PresenceProvider } from './lib/PresenceContext.jsx'
import { initAnalytics } from './lib/analytics'
import { initTelemetry } from './lib/telemetry'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './index.css'

// Loads GA4 once, before render. No-op (zero network) unless VITE_GA4_ID is set.
initAnalytics()

// First-party telemetry. Installed BEFORE render so a crash in the very first paint
// is still reported — that is the failure mode users describe as "the app is white".
initTelemetry()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <PresenceProvider>
            <App />
          </PresenceProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
