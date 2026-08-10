import { useMemo, useId } from 'react'
import { pct } from '@/lib/market'

const W = 640, H = 160, PAD_Y = 10

/**
 * How the odds moved.
 *
 * Every trade stored the whole price map as it stood immediately after it, so the
 * series needs no reconstruction and can never disagree with the book. Only the
 * leading outcomes are drawn: on a 20-runner futures market, twenty lines is a
 * scribble, and the story is always at the front of the field.
 */
export default function PriceChart({ market, trades }) {
  const gid = useId()

  const { series, empty } = useMemo(() => {
    // Oldest first — getTrades returns newest first for the tape.
    const rows = [...(trades || [])].reverse().filter(t => t.prices && typeof t.prices === 'object')
    if (rows.length < 2) return { series: [], empty: true }

    const top = [...market.outcomes].sort((a, b) => b.price - a.price).slice(0, 3)
    const n = rows.length
    return {
      empty: false,
      series: top.map(o => ({
        outcome: o,
        points: rows.map((t, i) => {
          const p = Number(t.prices[o.id] ?? 0)
          return [
            n === 1 ? W : (i / (n - 1)) * W,
            H - PAD_Y - p * (H - PAD_Y * 2),
          ]
        }),
      })),
    }
  }, [trades, market.outcomes])

  if (empty) {
    return (
      <div className="mkt-card p-4">
        <p className="text-xs text-fg-subtle text-center py-8">
          עדיין אין מספיק מסחר כדי להציג גרף
        </p>
      </div>
    )
  }

  return (
    <div className="mkt-card p-4">
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        {series.map((s, i) => (
          <span key={s.outcome.id} className="flex items-center gap-1.5 text-[11px] font-semibold">
            <span className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: `rgb(var(--brand) / ${1 - i * 0.35})` }} />
            <span className="text-fg-muted truncate max-w-[120px]">{s.outcome.label}</span>
            <span className="mkt-num text-fg-strong">{pct(s.outcome.price)}</span>
          </span>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="none"
        role="img" aria-label="גרף מחירים">
        {[0.25, 0.5, 0.75].map(g => (
          <line key={g} x1="0" x2={W} y1={H - PAD_Y - g * (H - PAD_Y * 2)} y2={H - PAD_Y - g * (H - PAD_Y * 2)}
            stroke="rgb(var(--line))" strokeWidth="1" strokeDasharray="3 4" />
        ))}
        {series.map((s, i) => (
          <g key={s.outcome.id}>
            <defs>
              <linearGradient id={`${gid}-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={`rgb(var(--brand) / ${0.18 - i * 0.05})`} />
                <stop offset="100%" stopColor="rgb(var(--brand) / 0)" />
              </linearGradient>
            </defs>
            {i === 0 && (
              <polygon fill={`url(#${gid}-${i})`}
                points={`0,${H} ${s.points.map(p => p.join(',')).join(' ')} ${W},${H}`} />
            )}
            <polyline
              fill="none" stroke={`rgb(var(--brand) / ${1 - i * 0.35})`}
              strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              points={s.points.map(p => p.join(',')).join(' ')} />
          </g>
        ))}
      </svg>
    </div>
  )
}
