import { Link, useLocation } from 'react-router-dom'
import { useSeo } from '@/lib/seo'

// Catch-all for unknown paths. Vercel's SPA rewrite serves 200 for every URL,
// so without this a mistyped link renders a blank shell under the generic title.
// We render a real Hebrew "not found" view and emit noindex so crawlers that
// reach a bad URL don't index it. Our own useSeo() runs after RouteSeo's, so
// the noindex here wins for the current (unknown) path.
export default function NotFound() {
  const { pathname } = useLocation()
  useSeo({ title: 'הדף לא נמצא', description: 'הדף שחיפשתם לא קיים', path: pathname, noindex: true })

  return (
    <div className="page-container min-h-[60vh] flex flex-col items-center justify-center text-center py-16">
      <RinkFourOhFour />
      <h1 className="mt-6 text-2xl font-black text-fg-strong">הכדור לא נמצא</h1>
      <p className="mt-2 page-subtitle max-w-md">
        חיפשנו בכל המגרש – הדף הזה לא קיים או שהוסר.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link to="/" className="btn-primary">חזרה למגרש</Link>
        <Link to="/games" className="btn-secondary">ללוח המשחקים</Link>
      </div>
    </div>
  )
}

// "404" drawn onto the rink, in the HockeyIcons line language (same as the crash
// page): a 4 in each half, and the 0 is the ball sitting on the faceoff spot — the
// one brand-colored accent, bouncing (.ball-out, which yields to reduced motion).
function RinkFourOhFour() {
  return (
    <svg
      viewBox="0 0 200 110"
      className="w-64 sm:w-80 h-auto text-fg-subtle"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="404"
      direction="ltr"
    >
      <rect x="6" y="6" width="188" height="98" rx="26" />
      <line x1="100" y1="6" x2="100" y2="104" />
      <circle cx="100" cy="55" r="22" />
      <path d="M6 40 h12 v30 h-12" />
      <path d="M194 40 h-12 v30 h12" />
      <g fill="currentColor" stroke="none" className="text-fg-strong" fontWeight="900" fontSize="62" textAnchor="middle">
        <text x="55" y="77">4</text>
        <text x="145" y="77">4</text>
      </g>
      <g className="ball-out">
        <circle cx="100" cy="55" r="13" fill="rgb(var(--brand))" stroke="none" />
      </g>
    </svg>
  )
}
