import { LayoutGrid, Trophy, Flame, MessageSquare } from "lucide-react"

export const FEED_FILTERS = [
  { key: "all", label: "הכל", icon: LayoutGrid },
  { key: "posts", label: "פוסטים", icon: MessageSquare },
  { key: "results", label: "תוצאות", icon: Trophy },
  { key: "highlights", label: "שיאים", icon: Flame },
]

// Which post types each filter matches
export function matchesFilter(post, key) {
  if (key === "all") return true
  if (key === "posts") return post.type === "post"
  if (key === "results") return post.type === "game_result"
  if (key === "highlights") return ["milestone", "champion", "top_scorer"].includes(post.type)
  return true
}

export default function FeedFilters({ active, onChange, counts = {}, orientation = "vertical" }) {
  if (orientation === "horizontal") {
    return (
      <div className="tab-bar overflow-x-auto">
        {FEED_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => onChange(f.key)}
            className={active === f.key ? "tab-active" : "tab-inactive"}
          >
            <f.icon className="w-4 h-4" />
            {f.label}
            {counts[f.key] != null && <span className="text-[11px] opacity-70">{counts[f.key]}</span>}
          </button>
        ))}
      </div>
    )
  }

  return (
    <nav className="card p-2 space-y-0.5">
      <p className="px-3 pt-1.5 pb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        סינון עדכונים
      </p>
      {FEED_FILTERS.map((f) => {
        const on = active === f.key
        return (
          <button
            key={f.key}
            onClick={() => onChange(f.key)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
              on
                ? "bg-orange-500 text-white shadow-sm shadow-orange-500/25"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/60 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <f.icon size={18} className={on ? "" : "text-slate-400 dark:text-slate-500"} />
            <span className="flex-1 text-right">{f.label}</span>
            {counts[f.key] != null && (
              <span className={`text-[11px] font-bold ${on ? "text-orange-100" : "text-slate-400 dark:text-slate-500"}`}>
                {counts[f.key]}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
