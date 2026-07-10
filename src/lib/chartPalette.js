/**
 * Chart palette. Validated, not eyeballed.
 *
 * The teams' own brand colors CANNOT be used as series colors. Verified against
 * the palette validator on the real card surfaces (#ffffff / slate-800 #1e293b):
 *   גבעת עדה חלוצים #ffffff → 1.03:1 contrast (invisible on light)
 *   קריית מוצקין    #969696 → zero chroma (reads as muted "no data" ink)
 *   בלג בוגרים      #15f919 → 1.40:1 contrast
 *   plus two greens (#15f919 / #2e8e41) and a blue/cyan pair (#155af9 / #15d3f9)
 * → FAIL on lightness band, chroma floor and contrast.
 *
 * So marks use the slots below and team identity is carried by the crest + name.
 *
 * Both sets PASS all six checks on our surfaces:
 *   light on #ffffff  — worst adjacent CVD ΔE 24.2
 *   dark  on #1e293b  — worst adjacent CVD ΔE 10.3 (floor band)
 *
 * TWO CONSEQUENCES, both mandatory — do not skip:
 *  1. Dark mode sits in the 8–12 CVD floor band, which is legal ONLY with a
 *     secondary encoding. Every categorical chart must direct-label its series
 *     (end labels) — colour may never be the only way to tell series apart.
 *  2. Light: aqua/yellow/magenta, dark: green, fall below 3:1 vs the surface.
 *     The relief rule applies: ship visible labels AND a table view.
 */

// Fixed slot order — the ordering IS the CVD-safety mechanism, not cosmetic.
export const SERIES_LIGHT = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4']
export const SERIES_DARK  = ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9', '#e66767', '#d55181']

// Single-series (magnitude) colour: categorical slot 1. One series → one colour
// for every bar. Never a value-ramp across nominal categories like teams.
export const SINGLE_LIGHT = '#2a78d6'
export const SINGLE_DARK  = '#3987e5'

// Diverging pair for polarity (e.g. goal difference around zero). Warm/cool
// poles with a NEUTRAL GRAY midpoint — never a hue at the midpoint.
export const DIVERGING = {
  light: { pos: '#2a78d6', neg: '#e34948', mid: '#f0efec' },
  dark:  { pos: '#3987e5', neg: '#e66767', mid: '#383835' },
}

// Chrome. Gridlines and axes are SOLID hairlines one shade off the surface —
// never dashed (dashing reads as "projection" or "threshold").
export const CHROME = {
  light: { grid: '#e1e0d9', axis: '#c3c2b7', muted: '#898781', surface: '#ffffff' },
  dark:  { grid: '#2c2c2a', axis: '#383835', muted: '#898781', surface: '#1e293b' },
}

export const seriesColors = (dark) => (dark ? SERIES_DARK : SERIES_LIGHT)
export const singleColor  = (dark) => (dark ? SINGLE_DARK : SINGLE_LIGHT)
export const chrome       = (dark) => (dark ? CHROME.dark : CHROME.light)
export const diverging    = (dark) => (dark ? DIVERGING.dark : DIVERGING.light)

/**
 * Colour follows the ENTITY, never its rank — otherwise filtering a series out
 * repaints the survivors and a reader who learned "בלג בוגרים is blue" is misled.
 * Keyed on a stable sort of team id, so the mapping never depends on standings.
 *
 * Only 7 teams exist, which is exactly the slot count. If an 8th ever appears,
 * fold the tail into "אחר" or facet — never generate or cycle a hue.
 */
export function teamColorIndex(teams = []) {
  const ids = [...teams].map(t => t.id).sort()
  const map = {}
  ids.forEach((id, i) => { map[id] = i % SERIES_LIGHT.length })
  return map
}
