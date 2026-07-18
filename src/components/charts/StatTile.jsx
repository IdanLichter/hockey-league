import { Link } from 'react-router-dom'
import Sparkline from './Sparkline'

/**
 * Overview stat tile: a big number with a label, and optional icon, sub-line,
 * sparkline and link. When `to` is set the whole tile becomes a Link (used for
 * the record game → /games/:id).
 *
 * `accent`: 'brand' colours the value orange; otherwise it inherits ink.
 */
export default function StatTile({ icon, value, label, sub, accent = 'default', to, spark, sparkColor }) {
  const valueCls = accent === 'brand' ? 'text-brand' : 'text-slate-900 dark:text-white'

  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${valueCls}`}>{value}</p>
        {icon && <span className="text-slate-300 dark:text-slate-600 shrink-0">{icon}</span>}
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">{label}</p>
      {sub && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">{sub}</p>}
      {spark && spark.length > 0 && (
        <div className="h-6 mt-2 -mb-0.5" dir="ltr">
          <Sparkline values={spark} color={sparkColor} />
        </div>
      )}
    </>
  )

  if (to) {
    return (
      <Link to={to} className="card-hover p-4 flex flex-col group focus:outline-none focus:ring-2 focus:ring-brand/30">
        {inner}
      </Link>
    )
  }
  return <div className="card p-4 flex flex-col">{inner}</div>
}
