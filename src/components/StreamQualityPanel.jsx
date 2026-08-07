import { Settings2, AlertTriangle } from "lucide-react"
import {
  RESOLUTIONS, FRAME_RATES, targetKbps, gbPerViewerHour, isDowngraded,
} from "@/lib/cameraConfig"

/**
 * Broadcast quality picker — shown to the streamer before and during a broadcast.
 *
 * Deliberately states the cost of each choice. There is no simulcast on Cloudflare's
 * WebRTC beta, so this single setting is what EVERY viewer receives; a streamer who
 * picks 1080p60 on a hunch is choosing to lock out anyone on a weak connection, and
 * they should be told that before they do it rather than after nobody can watch.
 */
export default function StreamQualityPanel({ quality, onChange, actual, live = false, disabled = false }) {
  const kbps = targetKbps(quality)
  const gb = gbPerViewerHour(quality)
  const heavy = kbps >= 3000
  const downgraded = isDowngraded(actual, quality)

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2.5">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
        <Settings2 className="w-4 h-4 text-brand" />
        איכות שידור
        {live && <span className="text-xs font-normal text-slate-400">(ניתן לשנות תוך כדי שידור)</span>}
      </div>

      <div className="flex gap-2">
        <label className="flex-1">
          <span className="block text-xs text-slate-500 dark:text-slate-400 mb-1">רזולוציה</span>
          <select
            value={quality.resolution}
            disabled={disabled}
            onChange={(e) => onChange({ ...quality, resolution: e.target.value })}
            className="filter-input text-sm w-full">
            {RESOLUTIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>
        <label className="flex-1">
          <span className="block text-xs text-slate-500 dark:text-slate-400 mb-1">קצב פריימים</span>
          <select
            value={quality.frameRate}
            disabled={disabled}
            onChange={(e) => onChange({ ...quality, frameRate: Number(e.target.value) })}
            className="filter-input text-sm w-full">
            {FRAME_RATES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </label>
      </div>

      <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
        <span>יעד: <span dir="ltr" className="font-mono">{(kbps / 1000).toFixed(1)} Mbps</span></span>
        <span>נתונים: <span dir="ltr" className="font-mono">{gb.toFixed(2)} GB</span> לשעה לכל צופה</span>
      </div>

      {/* What the camera actually delivered — asking for 60fps and quietly getting 30
          is the normal case on phones, so never present the request as the result. */}
      {actual && (
        <div className="text-xs text-slate-600 dark:text-slate-300">
          בפועל: <span dir="ltr" className="font-mono">{actual.width}×{actual.height}
            {actual.frameRate ? ` @${actual.frameRate}fps` : ""}</span>
          {downgraded && <span className="text-amber-600 dark:text-amber-400"> — המצלמה לא תומכת במבוקש</span>}
        </div>
      )}

      {heavy && (
        <div className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            כל הצופים מקבלים את אותה איכות — אין התאמה אוטומטית לרשת חלשה.
            באיכות זו צופים בחיבור איטי עלולים לא לראות כלל.
          </span>
        </div>
      )}
    </div>
  )
}
