import { useEffect, useState } from 'react'
import { BRAND_ORANGE } from '@/lib/brand'

// Some teams pick a white/near-white primary_color; white initial text on it is
// invisible. Fall back to the brand color for the initial background in that case.
function tooLight(hex) {
  const m = (hex || "").replace("#", "")
  if (!/^[0-9a-f]{6}$/i.test(m)) return false
  const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.8
}

/**
 * Reusable team logo component.
 * Falls back to a colored circle with team initial if there's no logo_url
 * or the image fails to load (dead/expired/removed URL).
 */
export default function TeamLogo({ team, size = 8, className = "" }) {
  const [imgError, setImgError] = useState(false)

  // React reuses this instance when a list re-sorts or filters, so a sticky
  // imgError would make the *next* team in that slot fall back to an initial
  // despite a working logo. Reset whenever the source changes.
  useEffect(() => { setImgError(false) }, [team?.logo_url])

  const px = {
    5: "w-5 h-5 text-[8px]",
    6: "w-6 h-6 text-[9px]",
    8: "w-8 h-8 text-xs",
    10: "w-10 h-10 text-sm",
    12: "w-12 h-12 text-base",
    14: "w-14 h-14 text-lg",
  }[size] || `w-8 h-8 text-xs`

  if (team?.logo_url && !imgError) {
    return (
      <img
        src={team.logo_url}
        alt={team.name}
        onError={() => setImgError(true)}
        className={`${px.split(' ').slice(0, 2).join(' ')} rounded-full object-cover shrink-0 bg-white dark:bg-slate-700 ${className}`}
      />
    )
  }

  return (
    <div
      className={`${px} rounded-full shrink-0 flex items-center justify-center text-white font-bold ring-2 ring-white dark:ring-slate-800 ${className}`}
      style={{ backgroundColor: tooLight(team?.primary_color) ? BRAND_ORANGE : (team?.primary_color || BRAND_ORANGE) }}
    >
      {team?.name?.charAt(0) || '?'}
    </div>
  )
}
