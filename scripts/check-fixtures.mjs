/**
 * Schedule invariant checks for the fixture generator.
 *
 *   node scripts/check-fixtures.mjs
 *
 * Pure logic, no database — it runs against the real team/venue shape of the
 * league. These are the properties a generated season must always have; if one
 * breaks, the schedule is wrong in a way that is tedious to spot by eye once
 * 42 fixtures are on a calendar.
 */

import { getBlockedDates } from "../src/lib/hebrewCalendar.js"
import { generateRegularSeason, dateKey } from "../src/lib/fixtures.js"

// The seven senior teams and their home courts, as configured in production.
const teams = [
  { id: "A", name: "גבעת עדה חלוצים", home_venue: "גבעת עדה" },
  { id: "B", name: "גבעת עדה נוער", home_venue: "גבעת עדה" },
  { id: "C", name: "בלג בוגרים", home_venue: "קריית ביאליק" },
  { id: "D", name: "בלג נוער", home_venue: "קריית ביאליק" },
  { id: "E", name: "קריית ביאליק", home_venue: "קריית ביאליק" },
  { id: "F", name: "רמת ישי", home_venue: "קריית ביאליק" },
  { id: "G", name: "קריית מוצקין", home_venue: "קריית מוצקין" },
]

const fail = []
const ok = (cond, msg) => { if (!cond) fail.push(msg) }

const blocked = await getBlockedDates(new Date(2026, 7, 1), new Date(2028, 0, 1))
const r = generateRegularSeason({
  teams, startDate: new Date(2026, 8, 1), blocked, seasonId: "S",
})

ok(r.fixtures.length === 42, `expected 42 fixtures, got ${r.fixtures.length}`)
ok(r.rounds === 14, `expected 14 rounds, got ${r.rounds}`)

// Home/away must be exactly balanced — that is the point of reversing leg two.
for (const t of teams) {
  const p = r.perTeam[t.id]
  ok(p.home === 6 && p.away === 6, `${t.name}: ${p.home}H/${p.away}A (want 6/6)`)
}

// Every ordered pairing exactly once => every pair meets twice, once each way.
const seen = new Map()
for (const f of r.fixtures) {
  const k = `${f.home_team_id}>${f.away_team_id}`
  seen.set(k, (seen.get(k) || 0) + 1)
}
ok(seen.size === 42, `expected 42 distinct ordered pairs, got ${seen.size}`)
ok([...seen.values()].every(v => v === 1), "an ordered pairing repeats")

// One game per team per matchday, three games a round.
const byDate = {}
for (const f of r.fixtures) (byDate[dateKey(f.date)] ||= []).push(f)
for (const [d, list] of Object.entries(byDate)) {
  const ids = list.flatMap(f => [f.home_team_id, f.away_team_id])
  ok(new Set(ids).size === ids.length, `a team plays twice on ${d}`)
  ok(list.length === 3, `${d} has ${list.length} games (want 3)`)
}

// A court can only host one game at a time — the reason slots are staggered.
const slotUse = new Set()
for (const f of r.fixtures) {
  if (!f.venue) continue
  const k = `${f.venue}@${f.game_date}`
  ok(!slotUse.has(k), `venue clash: ${f.venue} at ${f.game_date}`)
  slotUse.add(k)
}

for (const f of r.fixtures) {
  ok(f.date.getDay() === 6, `fixture not on a Saturday: ${dateKey(f.date)}`)
  ok(!blocked.has(dateKey(f.date)), `fixture on a blocked date: ${dateKey(f.date)}`)
  // Only sunset-start observances rule out the previous evening; a dawn-start
  // minor fast leaves Saturday night playable.
  const next = new Date(f.date); next.setDate(next.getDate() + 1)
  ok(!blocked.get(dateKey(next))?.eve, `fixture on the eve of ${dateKey(next)}`)
}

if (fail.length) {
  console.error("✗ FAILURES:\n" + fail.map(f => "  " + f).join("\n"))
  process.exit(1)
}

console.log("✓ all schedule invariants hold")
console.log(`  ${r.fixtures.length} fixtures over ${r.rounds} rounds`)
console.log(`  ${dateKey(r.fixtures[0].date)} → ${dateKey(r.fixtures.at(-1).date)}`)
console.log("  venue load:", r.perVenue)
console.log(`  skipped ${r.skipped.length} Saturdays:`)
for (const s of r.skipped) {
  console.log(`    ${dateKey(s.date)}${s.eve ? " (ערב)" : ""} — ${s.names.join(", ")}`)
}
