/**
 * Tiny dependency-free helpers shared by the hand-rolled SVG charts.
 * No React here — just geometry and scales.
 */

/**
 * Path for a vertical bar with only its TOP two corners rounded, anchored to the
 * baseline (the chart rule: "4px rounded data-ends anchored to the baseline").
 * x,y = top-left of the bar; w,h = size; r = corner radius.
 */
export function barPathTop(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h))
  if (h <= 0) return ''
  return (
    `M${x},${y + h}` +
    `L${x},${y + rr}` +
    `Q${x},${y} ${x + rr},${y}` +
    `L${x + w - rr},${y}` +
    `Q${x + w},${y} ${x + w},${y + rr}` +
    `L${x + w},${y + h}` +
    'Z'
  )
}

/**
 * Pick a rounded axis maximum and a set of INTEGER-friendly ticks for a given
 * data maximum. Candidates are 1/2/3/4/5/10 × 10ⁿ, so for the integer counts we
 * chart (goals, hat-tricks…) the ticks come out whole.
 * → { yMax, ticks:number[] }
 */
export function axisTicks(maxVal, target = 4) {
  if (!isFinite(maxVal) || maxVal <= 0) return { yMax: 1, ticks: [0, 1] }
  const rawStep = maxVal / target
  const pow = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const cands = [1, 2, 3, 4, 5, 10].map((m) => m * pow)
  const step = cands.find((s) => s >= rawStep) || cands[cands.length - 1]
  const yMax = Math.ceil(maxVal / step) * step
  const ticks = []
  for (let v = 0; v <= yMax + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100)
  return { yMax, ticks }
}

/**
 * Step-function lookup: value of a cumulative series at x (the y of the last
 * point with point.x <= x). Points must be sorted ascending by x.
 */
export function valueAt(points, x) {
  let y = points.length ? points[0].y : 0
  for (let i = 0; i < points.length; i++) {
    if (points[i].x <= x) y = points[i].y
    else break
  }
  return y
}

/** Linear scale factory: domain [d0,d1] → range [r0,r1]. */
export function scale(d0, d1, r0, r1) {
  const span = d1 - d0 || 1
  return (v) => r0 + ((v - d0) / span) * (r1 - r0)
}
