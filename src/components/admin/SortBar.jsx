import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"

/**
 * Shared sort control for the admin tabs. Renders a row of pill buttons — one per
 * sort key — so a manager can re-order any list to find data quickly.
 *
 * `options`: [{ key, label, dir? }] where the optional `dir` ('asc' | 'desc',
 *            default 'asc') is the direction applied the first time an option is
 *            selected (e.g. numeric columns want 'desc'). Clicking the already
 *            active option flips its direction.
 * `sort`:    the active { key, dir }.
 * `onChange`: receives the next { key, dir }.
 */
export function SortBar({ options, sort, onChange, className = "" }) {
  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className}`}>
      <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500 shrink-0">
        <ArrowUpDown className="w-3.5 h-3.5" /> מיון
      </span>
      {options.map(opt => {
        const active = sort.key === opt.key
        return (
          <button
            key={opt.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(
              active
                ? { key: opt.key, dir: sort.dir === "asc" ? "desc" : "asc" }
                : { key: opt.key, dir: opt.dir || "asc" }
            )}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              active
                ? "bg-brand text-white shadow-sm shadow-brand/25"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            {opt.label}
            {active && (sort.dir === "asc"
              ? <ArrowUp className="w-3 h-3" />
              : <ArrowDown className="w-3 h-3" />)}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Return a sorted copy of `items` for the active { key, dir }, using per-key
 * accessor functions. Strings compare Hebrew-aware via localeCompare; anything
 * else numerically. Empty/nullish values always sink to the bottom, whichever
 * direction is active, so blank fields never crowd the top.
 */
export function sortItems(items, sort, accessors) {
  const acc = accessors[sort.key]
  if (!acc) return items
  const mul = sort.dir === "desc" ? -1 : 1
  return [...items].sort((a, b) => {
    const va = acc(a)
    const vb = acc(b)
    const na = va == null || va === ""
    const nb = vb == null || vb === ""
    if (na && nb) return 0
    if (na) return 1
    if (nb) return -1
    const cmp = (typeof va === "string" || typeof vb === "string")
      ? String(va).localeCompare(String(vb), "he")
      : va - vb
    return cmp * mul
  })
}
