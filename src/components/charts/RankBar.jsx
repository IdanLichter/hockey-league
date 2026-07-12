import { useTheme } from '@/lib/ThemeContext'
import { singleColor } from '@/lib/chartPalette'
import TeamLogo from '@/components/TeamLogo'

/**
 * Horizontal ranked bars for a single positive metric (hat-tricks per player /
 * per team). Rows read RTL — crest + name on the right, bar in the middle, count
 * on the left — which is why they handle long Hebrew names where a vertical bar
 * chart's cramped x-labels would collide.
 *
 * Palette rules honoured: ONE series → ONE colour for every bar (never a
 * value-ramp); entity identity is carried by the crest + name, never the hue.
 * Widths are %-based off the max so it stays responsive with no DOM measuring.
 *
 * `data` = [{ id, name, value, team? }] (already sorted desc). Empty → nothing.
 */
export default function RankBar({ data = [], color, empty = 'אין נתונים' }) {
  const { dark } = useTheme()
  const bar = color || singleColor(dark)

  if (!data.length) {
    return <p className="text-center text-slate-400 dark:text-slate-500 py-8 text-sm">{empty}</p>
  }

  const max = Math.max(1, ...data.map((d) => d.value))

  return (
    <div className="w-full space-y-1.5 py-1">
      {data.map((d) => {
        const pct = (d.value / max) * 100
        return (
          <div key={d.id} className="flex items-center gap-2">
            {/* entity identity — crest + name (RTL so Hebrew reads naturally) */}
            <div dir="rtl" className="flex items-center gap-1.5 w-24 sm:w-32 shrink-0 min-w-0">
              {d.team && <TeamLogo team={d.team} size={5} />}
              <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200 truncate">{d.name}</span>
            </div>

            {/* bar track — one colour, grows from the start (right, in RTL flow) */}
            <div dir="rtl" className="relative flex-1 h-5 min-w-0 rounded bg-slate-100 dark:bg-slate-800/60">
              <div
                className="absolute inset-y-0 right-0 rounded"
                style={{ width: `${Math.max(pct, 3)}%`, background: bar }}
              />
            </div>

            {/* count in its own column so bars never overflow */}
            <span className="w-6 shrink-0 text-left text-[12px] font-bold tabular-nums text-slate-700 dark:text-slate-200">
              {d.value}
            </span>
          </div>
        )
      })}
    </div>
  )
}
