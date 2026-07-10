import { useTheme } from '@/lib/ThemeContext'
import { singleColor } from '@/lib/chartPalette'
import { scale } from './chartUtils'

/**
 * Minimal trend line — no axes, no labels. Decorative context for a StatTile.
 * Values are a plain number[]. Theme-aware via useTheme so it repaints on toggle.
 */
export default function Sparkline({ values = [], color, width = 120, height = 30, strokeWidth = 2 }) {
  const { dark } = useTheme()
  const stroke = color || singleColor(dark)
  if (!values.length) return null

  const pad = strokeWidth
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const sx = scale(0, Math.max(values.length - 1, 1), pad, width - pad)
  const sy = scale(min, max, height - pad, pad)
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ')
  const lastX = sx(values.length - 1)
  const lastY = sy(values[values.length - 1])

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-full" aria-hidden="true">
      <path d={d} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={strokeWidth + 0.5} fill={stroke} />
    </svg>
  )
}
