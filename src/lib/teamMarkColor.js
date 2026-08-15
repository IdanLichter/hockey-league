/**
 * Team colours, conditioned until they are usable as chart marks.
 *
 * The league's raw `teams.primary_color` values cannot be drawn on a chart —
 * that is measured, not an opinion (see src/lib/chartPalette.js): גבעת עדה
 * חלוצים is `#ffffff` (1.03:1 on a white card — an invisible line), קריית
 * מוצקין is `#969696` (zero chroma, reads as disabled ink), בלג בוגרים is
 * `#15f919` (1.4:1). The statistics charts answered that by dropping team
 * colour entirely and carrying identity with the crest and name.
 *
 * A price chart is a different problem: its lines are far apart in space, it
 * draws at most three of them, and every one is already direct-labelled with
 * the team name and its live percentage. So identity CAN ride on hue here —
 * as long as the hue is the only thing we take from the team.
 *
 * What we keep is the hue. Lightness is pinned to a band that contrasts with
 * the card behind it (market surfaces: `#ffffff` light, `#161719` dark) and
 * chroma is floored so the mark reads as a colour rather than as grey. A red
 * team stays unmistakably red; it just stops being neon or invisible.
 *
 * A colour with no hue to keep (white, black, grey) cannot survive this, so
 * those teams fall back to a validated categorical slot instead.
 */

import { SERIES_LIGHT, SERIES_DARK } from './chartPalette'

// Below this chroma there is no hue worth preserving — the value is white,
// black or grey, and any hue we invented would be our own, not the team's.
const ACHROMATIC = 0.035

// Target bands. Light surfaces need a darker mark, dark surfaces a lighter one.
const BAND = {
  light: { L: 0.55, cMin: 0.11, cMax: 0.17 },
  dark:  { L: 0.76, cMin: 0.10, cMax: 0.16 },
}

// Two lines closer than this in hue are not reliably distinguishable, and the
// league has two greens (#15f919 / #2e8e41) and a blue/cyan pair that can face
// each other in the same market.
const HUE_COLLISION_DEG = 22
const COLLISION_L_SHIFT = 0.14

/* ---------------------------------------------------------------- sRGB ↔ OKLCH */

const srgbToLinear = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const linearToSrgb = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

function parseHex(hex) {
  const s = String(hex || '').trim().replace('#', '')
  const full = s.length === 3 ? s.split('').map(ch => ch + ch).join('') : s
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255)
}

function rgbToOklch([r, g, b]) {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  return { L, C: Math.hypot(A, B), h: (Math.atan2(B, A) * 180) / Math.PI }
}

function oklchToRgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180
  const A = C * Math.cos(h), B = C * Math.sin(h)
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ]
}

const inGamut = rgb => rgb.every(c => c >= -0.0001 && c <= 1.0001)

/**
 * OKLCH → hex, walking chroma down until the colour fits in sRGB. Lightness and
 * hue are held: the band is what makes the mark legible, and the hue is the
 * team's identity — chroma is the only one of the three we can afford to trade.
 */
function oklchToHex(L, C, h) {
  let c = C
  let rgb = oklchToRgb(L, c, h)
  for (let i = 0; i < 24 && !inGamut(rgb); i++) {
    c *= 0.94
    rgb = oklchToRgb(L, c, h)
  }
  return '#' + rgb
    .map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0'))
    .join('')
}

/* ------------------------------------------------------------------- public */

/**
 * A team's colour, conditioned for a chart mark. Returns null when the source
 * has no hue to carry (white / grey / black) — the caller falls back.
 *
 * @param {string} hex   the team's primary_color
 * @param {boolean} dark is the chart on a dark surface
 * @param {number} lNudge lightness offset for collision relief
 */
export function teamMark(hex, dark, lNudge = 0) {
  const rgb = parseHex(hex)
  if (!rgb) return null
  const { C, h } = rgbToOklch(rgb)
  if (C < ACHROMATIC) return null

  const band = dark ? BAND.dark : BAND.light
  const surface = dark ? SURFACE.dark : SURFACE.light
  const c = Math.min(Math.max(C, band.cMin), band.cMax)

  // The band alone is not a guarantee: a collision nudge can push a line back
  // toward the surface it has to stand out from. Walk lightness AWAY from the
  // surface until the mark clears 3:1 — the floor for a graphical object.
  let L = Math.min(0.92, Math.max(0.34, band.L + lNudge))
  const step = dark ? 0.03 : -0.03
  let out = oklchToHex(L, c, h)
  for (let i = 0; i < 14 && contrast(out, surface) < 3; i++) {
    L = Math.min(0.95, Math.max(0.2, L + step))
    out = oklchToHex(L, c, h)
  }
  return out
}

// The surfaces a market chart is actually drawn on (index.css, .market-theme).
const SURFACE = { light: '#ffffff', dark: '#161719' }

const relLuminance = hex => {
  const rgb = parseHex(hex) || [0, 0, 0]
  const [r, g, b] = rgb.map(srgbToLinear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio. 3:1 is the floor for a graphical object like a line. */
export function contrast(a, b) {
  const [hi, lo] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Stable per-team slot for a team with no usable hue, so it keeps the same
 * colour on every chart. Slots that fail 3:1 on THIS surface are skipped —
 * the categorical set was validated against the league's card (#1e293b), and
 * the market's near-black is darker, which drops its darkest slots below the
 * floor.
 */
function fallbackSlot(key, dark) {
  const slots = dark ? SERIES_DARK : SERIES_LIGHT
  const surface = dark ? SURFACE.dark : SURFACE.light
  let hash = 0
  for (const ch of String(key || '')) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[(hash + i) % slots.length]
    if (contrast(slot, surface) >= 3) return slot
  }
  return dark ? '#e2e2e0' : '#292928'   // last resort: plain ink, always legible
}

/**
 * Colours for one chart's series, in draw order.
 *
 * Each entry is `{ color, teamId }` — `color` being the team's raw
 * primary_color (nullable). Later series that land within
 * HUE_COLLISION_DEG of an earlier one are pushed apart in lightness rather
 * than recoloured: two green teams should both still read as green, and the
 * direct labels carry the rest.
 */
export function seriesTeamColors(entries, dark) {
  const used = []
  return entries.map(({ color, teamId }, i) => {
    const rgb = parseHex(color)
    const hue = rgb ? rgbToOklch(rgb).h : null
    let nudge = 0

    if (hue != null) {
      // Circular distance on the hue wheel, in degrees.
      const clashes = used.filter(u => Math.abs(((u.hue - hue + 540) % 360) - 180) < HUE_COLLISION_DEG)
      // Always step AWAY from the surface — lighter on dark, darker on light —
      // so relief never costs contrast. Each further clash steps once more, so
      // a third green does not land back on the first.
      if (clashes.length) nudge = (dark ? 1 : -1) * COLLISION_L_SHIFT * clashes.length
    }

    const mark = teamMark(color, dark, nudge)
    if (hue != null && mark) used.push({ hue })
    return mark || fallbackSlot(teamId || `slot-${i}`, dark)
  })
}
