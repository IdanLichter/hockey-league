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
      <div className="text-7xl font-black text-brand-strong dark:text-brand-light tracking-tight">404</div>
      <h1 className="mt-4 text-2xl font-black text-fg-strong">הדף לא נמצא</h1>
      <p className="mt-2 page-subtitle max-w-md">
        הכתובת שחיפשתם לא קיימת או שהוסרה. אפשר לחזור לעמוד הבית ולהמשיך משם.
      </p>
      <Link to="/" className="btn-primary mt-6">
        חזרה לעמוד הבית
      </Link>
    </div>
  )
}
