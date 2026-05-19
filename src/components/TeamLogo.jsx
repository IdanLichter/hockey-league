/**
 * Reusable team logo component.
 * Falls back to a colored circle with team initial if no logo_url.
 */
export default function TeamLogo({ team, size = 8, className = "" }) {
  const sizeClass = {
    6: "w-6 h-6",
    8: "w-8 h-8",
    10: "w-10 h-10",
    12: "w-12 h-12",
    14: "w-14 h-14",
  }[size] || `w-${size} h-${size}`

  if (team?.logo_url) {
    return (
      <img
        src={team.logo_url}
        alt={team.name}
        className={`${sizeClass} rounded-full object-cover shrink-0 ${className}`}
      />
    )
  }

  return (
    <div
      className={`${sizeClass} rounded-full shrink-0 flex items-center justify-center text-white font-bold text-xs ${className}`}
      style={{ backgroundColor: team?.primary_color || '#f97316' }}
    >
      {team?.name?.charAt(0) || '?'}
    </div>
  )
}
