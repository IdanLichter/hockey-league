/**
 * Jewish/Israeli calendar dates that block a fixture.
 *
 * Uses @hebcal/core with the Israeli scheme. The library is imported lazily —
 * it is only needed when the league manager generates a schedule, and there is
 * no reason to put it in the bundle everyone downloads.
 *
 * Two things here are easy to get wrong:
 *
 * 1. The MODERN_HOLIDAY flag is far too broad. It includes יום השפה העברית,
 *    יום המשפחה, יום בן־גוריון, חג הסיגד and more — nobody cancels a game for
 *    Hebrew Language Day. Only the three solemn national days are blocked, by
 *    their stable English descriptions.
 *
 * 2. A Jewish day begins at sunset the evening before. Games run 18:00–20:00 on
 *    a Saturday, which is right on that boundary, so a Saturday is unplayable if
 *    the FOLLOWING day is a blocked date — the chag has already started.
 */

/** Solemn national days. Matched on getDesc(), which is a stable identifier. */
const MEMORIAL_DESCS = new Set(["Yom HaShoah", "Yom HaZikaron", "Yom HaAtzma'ut"])

export const BLOCK_CATEGORIES = [
  { key: "chag", label: "חגים", hint: "ראש השנה, יום כיפור, סוכות, פסח, שבועות" },
  { key: "cholHaMoed", label: "חול המועד", hint: "ימי הביניים של פסח וסוכות" },
  { key: "memorial", label: "ימי זיכרון", hint: "יום השואה, יום הזיכרון, ערב יום העצמאות" },
  { key: "fast", label: "ימי צום", hint: "תשעה באב וצומות נוספים" },
]

export const DEFAULT_BLOCKED = ["chag", "cholHaMoed", "memorial", "fast"]

const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

/**
 * Blocked dates in a range.
 * @returns {Promise<Map<string, {names: string[], categories: string[]}>>} keyed by local YYYY-MM-DD
 */
export async function getBlockedDates(from, to, categories = DEFAULT_BLOCKED) {
  const { HebrewCalendar, flags } = await import("@hebcal/core")
  const enabled = new Set(categories)

  // `eve` marks observances that begin at SUNSET the night before, which is what
  // makes the previous evening unplayable. Minor fasts (צום גדליה, עשרה בטבת,
  // תענית אסתר, י״ז בתמוז) begin at DAWN, so a Saturday-evening game finishes
  // hours before one starts — those block only their own day. Only Yom Kippur
  // and Tisha B'Av, the major fasts, run sunset to nightfall.
  const matchers = {
    chag: { test: (e) => e.getFlags() & flags.CHAG, eve: true },
    cholHaMoed: { test: (e) => e.getFlags() & flags.CHOL_HAMOED, eve: true },
    memorial: { test: (e) => MEMORIAL_DESCS.has(e.getDesc()), eve: true },
    fast: { test: (e) => e.getFlags() & flags.MAJOR_FAST, eve: true },
    fastMinor: { test: (e) => e.getFlags() & flags.MINOR_FAST, eve: false },
  }

  const events = HebrewCalendar.calendar({
    start: from,
    end: to,
    il: true,           // Israeli scheme: one day of chag, not two
    sedrot: false,
    omer: false,
    candlelighting: false,
  })

  // The UI offers one "ימי צום" choice; it turns on both fast matchers.
  const isOn = (k) => enabled.has(k === "fastMinor" ? "fast" : k)

  const blocked = new Map()
  for (const ev of events) {
    const hit = Object.keys(matchers).filter((k) => isOn(k) && matchers[k].test(ev))
    if (!hit.length) continue
    const key = iso(ev.getDate().greg())
    const entry = blocked.get(key) || { names: [], categories: [], eve: false }
    const name = ev.render("he")
    if (!entry.names.includes(name)) entry.names.push(name)
    for (const c of hit) {
      if (!entry.categories.includes(c)) entry.categories.push(c)
      if (matchers[c].eve) entry.eve = true
    }
    blocked.set(key, entry)
  }
  return blocked
}

/**
 * Why this Saturday cannot host a game, or null if it can.
 *
 * Checks the day itself and the next day — an evening game falls after sunset,
 * so a chag starting that night rules the slot out even though the Gregorian
 * date looks clear.
 */
export function blockedReason(date, blocked) {
  const own = blocked.get(iso(date))
  if (own) return { names: own.names, eve: false }

  const next = new Date(date)
  next.setDate(next.getDate() + 1)
  const tomorrow = blocked.get(iso(next))
  // Only if tomorrow actually starts at sunset. A dawn-start fast leaves the
  // previous evening free.
  if (tomorrow?.eve) return { names: tomorrow.names, eve: true }

  return null
}

export { iso as dateKey }
