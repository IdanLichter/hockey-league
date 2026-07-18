import { useOnline } from "@/lib/PresenceContext"

/**
 * Live "who's online" pill — a real count of connected clients via Realtime Presence.
 * Total always shows; the per-platform breakdown (web / iPhone / Android) surfaces in
 * the tooltip, and inline once the native apps start reporting (ios/android > 0).
 */
export default function OnlinePresence({ className = "" }) {
  const { total, web, ios, android } = useOnline()
  if (!total) return null
  const hasMobile = ios > 0 || android > 0
  const title = hasMobile
    ? `מחוברים כעת: ${total} · אתר ${web} · אייפון ${ios} · אנדרואיד ${android}`
    : `מחוברים כעת: ${total}`

  return (
    <span title={title}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-xs font-bold ${className}`}>
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <span className="tabular-nums">{total}</span>
      <span className="hidden sm:inline">{hasMobile ? "מחוברים" : "מחוברים"}</span>
      {hasMobile && (
        <span className="hidden md:inline font-medium text-emerald-600/80 dark:text-emerald-400/80">
          ({web}‎ · ‎{ios} 📱)
        </span>
      )}
    </span>
  )
}
