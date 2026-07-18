import { useOnline } from "@/lib/PresenceContext"

/**
 * Live "who's online" indicator — a real count of connected clients via Realtime Presence.
 * Rendered as green text with a pulsing underline (no dot, no pill background) — the
 * underline is the "live" cue. Total always shows; the per-platform breakdown
 * (web / iPhone / Android) surfaces in the tooltip, and inline once the native apps
 * start reporting (ios/android > 0).
 */
export default function OnlinePresence({ className = "" }) {
  const { total, web, ios, android } = useOnline()
  if (!total) return null
  const hasMobile = ios > 0 || android > 0
  const title = hasMobile
    ? `מחליקים כעת: ${total} · אתר ${web} · אייפון ${ios} · אנדרואיד ${android}`
    : `מחליקים כעת: ${total}`

  return (
    <span title={title}
      className={`relative inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 text-xs font-bold ${className}`}>
      <span className="tabular-nums">{total}</span>
      <span>מחליקים</span>
      {hasMobile && (
        <span className="hidden md:inline font-medium text-emerald-600/80 dark:text-emerald-400/80">
          ({web}‎ · ‎{ios} 📱)
        </span>
      )}
      {/* pulsing underline — the "live" cue that replaced the old ping dot */}
      <span aria-hidden
        className="absolute -bottom-0.5 inset-x-0 h-0.5 rounded-full bg-emerald-500 animate-pulse" />
    </span>
  )
}
