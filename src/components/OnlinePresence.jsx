import { Monitor, Smartphone } from "lucide-react"
import { useOnline } from "@/lib/PresenceContext"

/**
 * Live "who's online" indicator — a real count of connected clients via Realtime Presence.
 * Rendered as green text with a pulsing underline (no dot, no pill background) — the
 * underline is the "live" cue. Total always shows; once the native apps start reporting
 * (ios/android > 0) a compact icon split — 🖥 web · 📱 mobile — appears inline (site vs.
 * mobile, so it always sums to the total), and the full per-OS breakdown lives in the
 * tooltip.
 */
export default function OnlinePresence({ className = "" }) {
  const { total, web, ios, android } = useOnline()
  if (!total) return null
  const mobile = ios + android
  const hasMobile = mobile > 0
  const title = hasMobile
    ? `מתגלגלים עכשיו: ${total} · אתר ${web} · אייפון ${ios} · אנדרואיד ${android}`
    : `מתגלגלים עכשיו: ${total}`

  return (
    <span title={title}
      className={`relative inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 text-xs font-bold ${className}`}>
      <span className="tabular-nums">{total}</span>
      <span>מתגלגלים עכשיו</span>
      {hasMobile && (
        // LTR so the icon→number tokens render predictably (🖥 7 · 📱 1) inside the RTL badge
        <span dir="ltr" className="hidden md:inline-flex items-center gap-1.5 font-medium text-emerald-600/80 dark:text-emerald-400/80">
          <span className="inline-flex items-center gap-0.5">
            <Monitor className="w-3 h-3" aria-hidden />
            <span className="tabular-nums">{web}</span>
          </span>
          <span aria-hidden className="text-emerald-500/40">·</span>
          <span className="inline-flex items-center gap-0.5">
            <Smartphone className="w-3 h-3" aria-hidden />
            <span className="tabular-nums">{mobile}</span>
          </span>
        </span>
      )}
      {/* pulsing underline — the "live" cue that replaced the old ping dot */}
      <span aria-hidden
        className="absolute -bottom-0.5 inset-x-0 h-0.5 rounded-full bg-emerald-500 animate-pulse" />
    </span>
  )
}
