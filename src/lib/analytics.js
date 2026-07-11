// Google Analytics 4 — dormant unless VITE_GA4_ID is set.
//
// When the env var is absent (local dev, Preview deploys, or before the GA4
// property is provisioned) every export is a no-op and NOT a single network
// request is made: initAnalytics() injects no gtag script and trackPageview()
// returns immediately. The tag lights up only in the Production build that
// carries VITE_GA4_ID.

const GA_ID = import.meta.env.VITE_GA4_ID
let started = false

/**
 * Load gtag.js and configure GA4 once. Safe to call unconditionally at boot —
 * it self-guards on the env var and on double-invocation.
 */
export function initAnalytics() {
  if (!GA_ID || started || typeof document === 'undefined') return
  started = true

  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
  document.head.appendChild(s)

  window.dataLayer = window.dataLayer || []
  // gtag must forward `arguments` verbatim to the dataLayer, so keep it a
  // classic function (not an arrow) — this is GA's canonical snippet.
  function gtag() { window.dataLayer.push(arguments) }
  window.gtag = gtag
  gtag('js', new Date())
  // send_page_view:false — this is an SPA. We fire page_view manually on each
  // route change (see trackPageview) so the per-route <title> settles first and
  // the initial load isn't double-counted.
  gtag('config', GA_ID, { send_page_view: false })
}

/**
 * Report a virtual pageview for SPA navigation. No-op until initAnalytics() has
 * run and the tag is live.
 * @param {string} path e.g. '/players/abc-123'
 */
export function trackPageview(path) {
  if (!GA_ID || typeof window === 'undefined' || typeof window.gtag !== 'function') return
  window.gtag('event', 'page_view', {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  })
}
