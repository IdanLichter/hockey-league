import React from 'react'
import { trackError, flush } from '@/lib/telemetry'

/**
 * Catches a render-time crash, reports it, and shows something human instead of the
 * blank page React leaves behind when a component throws.
 *
 * A thrown render is the worst failure this app has, because it is completely silent:
 * the user sees white, the server sees a clean 200, and nobody files a report — they
 * just stop using it. This turns that into a row in the telemetry tab.
 *
 * A class component on purpose: componentDidCatch has no hook equivalent.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { crashed: false }
  }

  static getDerivedStateFromError() {
    return { crashed: true }
  }

  componentDidCatch(error, info) {
    // The component stack names the screen that broke, which is the single most
    // useful field when reading this back. The message is a developer string, never
    // user content, so it is safe to carry.
    const component = String(info?.componentStack || '')
      .trim().split('\n')[0]?.trim().replace(/^(at|in)\s+/, '') || 'unknown'
    trackError('render_crash', {
      reason: String(error?.message || error || 'unknown').slice(0, 200),
      component: component.slice(0, 80),
    })
    // The user's next move is a reload, which discards the queue — send it now.
    flush()
  }

  render() {
    if (!this.state.crashed) return this.props.children
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">משהו השתבש</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            התקלה דווחה אוטומטית. אפשר לנסות לרענן את העמוד.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold"
          >
            רענון
          </button>
        </div>
      </div>
    )
  }
}
