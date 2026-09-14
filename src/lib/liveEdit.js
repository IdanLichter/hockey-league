import { supabase } from './supabase'

/**
 * "עריכה חיה" — an admin standing anywhere in the app describes a UI bug and a
 * cloud agent fixes it. The agent never sees the screen, so everything it has to
 * go on is assembled here: the route, the rendered text of the element the admin
 * pointed at (which is what actually locates the file), and whatever the console
 * was complaining about at the time.
 *
 * The payload shape is a contract with /api/live-edit — keys and types are fixed.
 */

const MAX_TEXT = 200      // rendered text, per the payload contract
const MAX_ERRORS = 5
const MAX_ERROR_LEN = 300 // one runaway stack shouldn't crowd out the other four

// ─── Console error ring buffer ──────────────────────────────────────────────

const recentErrors = []

function remember(message) {
  if (!message) return
  recentErrors.push(String(message).slice(0, MAX_ERROR_LEN))
  if (recentErrors.length > MAX_ERRORS) recentErrors.shift()
}

// console.error is handed anything at all — Errors, React elements, circular
// objects — and none of it may throw on the way to a string.
function asText(value) {
  try {
    if (value instanceof Error) return `${value.name}: ${value.message}`
    if (typeof value === 'string') return value
    return JSON.stringify(value) ?? String(value)
  } catch {
    try { return String(value) } catch { return '[unprintable]' }
  }
}

let installed = false

function installErrorCapture() {
  if (installed || typeof window === 'undefined') return
  installed = true

  const original = console.error
  console.error = function (...args) {
    // The app's own logging runs first and unconditionally: a fault in our
    // bookkeeping must never be the reason an error stops reaching the console.
    try {
      original.apply(console, args)
    } finally {
      try { remember(args.map(asText).join(' ')) } catch { /* recording is best-effort */ }
    }
  }

  // addEventListener rather than `window.onerror = ...`: assigning would silently
  // replace whatever handler is already there (today: none, tomorrow: anyone's).
  window.addEventListener('error', (e) => {
    try {
      const where = e?.filename ? ` (${e.filename}:${e.lineno})` : ''
      remember(e?.message ? `${e.message}${where}` : 'Unknown window error')
    } catch { /* never throw from an error handler */ }
  })

  // A failed data fetch usually surfaces here rather than as a thrown error, and
  // it is exactly the kind of thing that explains a broken-looking page.
  window.addEventListener('unhandledrejection', (e) => {
    try { remember(`Unhandled rejection: ${asText(e?.reason)}`) } catch { /* as above */ }
  })
}

installErrorCapture()

// ─── Element description ────────────────────────────────────────────────────

const collapse = (s) => (s || '').replace(/\s+/g, ' ').trim()

// SVG elements carry an SVGAnimatedString in .className, so read the attribute.
const classOf = (el) => collapse(el?.getAttribute?.('class') || '')

/**
 * A short, human-readable CSS path. Deliberately not a unique selector: the app
 * is Tailwind, so a full class list is forty utilities of noise and half of them
 * (`hover:`, `sm:`, `w-[3px]`) aren't even valid unescaped. Two plain classes per
 * level, five levels, and an id ends the climb because it already pins the node.
 */
function selectorFor(el) {
  const parts = []
  let node = el

  while (node && node.nodeType === 1 && node !== document.body && parts.length < 5) {
    if (node.id) { parts.unshift(`#${node.id}`); break }

    let part = node.tagName.toLowerCase()
    const classes = classOf(node).split(' ').filter(c => /^[a-zA-Z][\w-]*$/.test(c)).slice(0, 2)
    if (classes.length) part += `.${classes.join('.')}`

    const twins = node.parentElement
      ? Array.from(node.parentElement.children).filter(c => c.tagName === node.tagName)
      : []
    if (twins.length > 1) part += `:nth-of-type(${twins.indexOf(node) + 1})`

    parts.unshift(part)
    node = node.parentElement
  }

  return parts.join(' > ')
}

/**
 * Snapshot of the picked element, taken at pick time rather than at send time —
 * the admin types for a while and a live page can re-render the node out from
 * under us. Returns the four element fields of the payload.
 */
export function describeElement(el) {
  if (!el) return null
  return {
    text: collapse(el.innerText || el.textContent).slice(0, MAX_TEXT),
    selector: selectorFor(el),
    tag: el.tagName.toLowerCase(),
    classes: classOf(el),
  }
}

// ─── Payload ────────────────────────────────────────────────────────────────

export function buildPayload({ request, picked }) {
  return {
    route: window.location.pathname + window.location.search,
    request: (request || '').trim(),
    text: picked?.text || '',
    selector: picked?.selector || '',
    tag: picked?.tag || '',
    classes: picked?.classes || '',
    viewport: { w: window.innerWidth, h: window.innerHeight },
    // Read off the DOM, not the theme context: /market re-skins <html> too, and
    // what matters to the fixer is which stylesheet branch the admin is looking at.
    theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    errors: recentErrors.slice(-MAX_ERRORS),
  }
}

// ─── Submit ─────────────────────────────────────────────────────────────────

const REASONS = {
  'not-configured': "הפיצ'ר עדיין לא מחובר",
  forbidden: 'אין לך הרשאה',
  busy: 'יש כבר בקשה שרצה, נסו בעוד רגע',
}

export const reasonText = (reason) => REASONS[reason] || 'השליחה נכשלה. נסו שוב בעוד רגע'

/**
 * POST the payload and always resolve to the endpoint's own { ok, ... } shape —
 * the caller renders one thing either way, so a dead network or Vercel's HTML
 * 404 page has to arrive as a `reason` rather than as a thrown exception.
 *
 * The access token rides along because this fires a paid agent; the endpoint
 * re-checks admin server-side (the client flag proves nothing).
 */
export async function submitLiveEdit(payload) {
  let token = null
  try {
    const { data } = await supabase.auth.getSession()
    token = data?.session?.access_token || null
  } catch { /* unauthenticated is the endpoint's call to make, not ours */ }

  let res
  try {
    res = await fetch('/api/live-edit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    })
  } catch {
    return { ok: false, reason: 'network' }
  }

  let body = null
  try { body = await res.json() } catch { /* not JSON — handled below */ }
  if (body && typeof body.ok === 'boolean') return body

  // An answer that isn't JSON means nothing is listening on the route: Vercel's
  // own 404, or (in dev) the SPA fallback handing back index.html with a 200.
  // Either way "not wired up" is exactly what the admin needs to be told.
  return { ok: false, reason: res.ok || res.status === 404 ? 'not-configured' : `http-${res.status}` }
}
