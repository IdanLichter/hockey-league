/**
 * Reusable team logo component.
 * Falls back to a colored circle with team initial if no logo_url.
 */
export default function TeamLogo({ team, size = 8, className = "" }) {
  const px = {
    5: "w-5 h-5 text-[8px]",
    6: "w-6 h-6 text-[9px]",
    8: "w-8 h-8 text-xs",
    10: "w-10 h-10 text-sm",
    12: "w-12 h-12 text-base",
    14: "w-14 h-14 text-lg",
  }[size] || `w-8 h-8 text-xs`

  if (team?.logo_url) {
    return (
      <img
        src={team.logo_url}
        alt={team.name}
        className={`${px.split(' ').slice(0, 2).join(' ')} rounded-full object-cover shrink-0 bg-white dark:bg-slate-700 ${className}`}
      />
    )
  }

  return (
    <div
      className={`${px} rounded-full shrink-0 flex items-center justify-center text-white font-bold ring-2 ring-white dark:ring-slate-800 ${className}`}
      style={{ backgroundColor: team?.primary_color || '#f97316' }}
    >
      {team?.name?.charAt(0) || '?'}
    </div>
  )
}
