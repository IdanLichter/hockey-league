/**
 * Fixture generation for a regular season.
 *
 * Double round-robin: every pair meets twice, once at each team's home. With an
 * odd number of teams a dummy is added so one team byes each round — 7 teams
 * gives 14 rounds of 3 games, 42 fixtures in total.
 *
 * Home/away balance is exact by construction: leg two is leg one with every
 * pairing reversed, so each team ends on the same number of home and away games
 * no matter how leg one was oriented.
 *
 * Pure functions — no network, no Supabase — so the schedule can be previewed
 * and checked before anything is written.
 */

// Explicit extension so this module can be run directly under Node for the
// schedule checks below; Vite resolves it identically.
import { blockedReason, dateKey } from "./hebrewCalendar.js"

export const DEFAULT_SLOTS = ["18:00", "19:00", "20:00"]

/**
 * Circle-method round robin.
 * @param {string[]} ids team ids
 * @returns {Array<Array<[string,string]>>} rounds of [homeId, awayId]
 */
export function buildDoubleRoundRobin(ids) {
  const arr = [...ids]
  if (arr.length % 2) arr.push(null) // bye
  const n = arr.length

  const firstLeg = []
  for (let r = 0; r < n - 1; r++) {
    const pairs = []
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i]
      const b = arr[n - 1 - i]
      if (a !== null && b !== null) {
        // Alternate orientation so leg one does not hand the same side every
        // week; leg two reverses everything, which is what makes the totals equal.
        pairs.push((r + i) % 2 === 0 ? [a, b] : [b, a])
      }
    }
    firstLeg.push(pairs)
    arr.splice(1, 0, arr.pop()) // rotate, keeping arr[0] fixed
  }

  const secondLeg = firstLeg.map(round => round.map(([h, a]) => [a, h]))
  return [...firstLeg, ...secondLeg]
}

/**
 * The next `needed` playable Saturdays from `from`, skipping blocked ones.
 * Returns the skipped dates too — the league manager should see what was
 * dropped and why, not just the result.
 */
export function playableSaturdays(from, needed, blocked, limitWeeks = 120) {
  const cursor = new Date(from)
  cursor.setHours(0, 0, 0, 0)
  // advance to the first Saturday on or after `from`
  cursor.setDate(cursor.getDate() + ((6 - cursor.getDay() + 7) % 7))

  const dates = []
  const skipped = []
  let weeks = 0
  while (dates.length < needed && weeks < limitWeeks) {
    const reason = blockedReason(cursor, blocked)
    if (reason) {
      skipped.push({ date: new Date(cursor), names: reason.names, eve: reason.eve })
    } else {
      dates.push(new Date(cursor))
    }
    cursor.setDate(cursor.getDate() + 7)
    weeks++
  }
  return { dates, skipped, exhausted: dates.length < needed }
}

/** Local date + "HH:MM" → an ISO instant. */
function at(date, time) {
  const [h, m] = time.split(":").map(Number)
  const d = new Date(date)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

/**
 * Build a full regular season.
 *
 * Each game is played at the home team's own venue. Within a round the games
 * are sorted by venue so that any sharing a court are adjacent, then given
 * consecutive slots — which is what guarantees no court is double-booked even
 * when all three home teams share one.
 *
 * @returns {{fixtures: object[], skipped: object[], rounds: number, warnings: string[],
 *            perTeam: object, perVenue: object, exhausted: boolean}}
 */
export function generateRegularSeason({ teams, startDate, blocked, slots = DEFAULT_SLOTS, seasonId }) {
  const warnings = []
  const ids = teams.map(t => t.id)
  const byId = Object.fromEntries(teams.map(t => [t.id, t]))

  if (ids.length < 2) {
    return { fixtures: [], skipped: [], rounds: 0, warnings: ["צריך לפחות שתי קבוצות"], perTeam: {}, perVenue: {}, exhausted: false }
  }

  const missingVenue = teams.filter(t => !t.home_venue).map(t => t.name)
  if (missingVenue.length) {
    warnings.push(`אין מגרש בית ל: ${missingVenue.join(", ")} — המשחקים שלהן ייווצרו ללא מגרש`)
  }

  const rounds = buildDoubleRoundRobin(ids)
  const { dates, skipped, exhausted } = playableSaturdays(startDate, rounds.length, blocked)
  if (exhausted) warnings.push("לא נמצאו מספיק שבתות פנויות בטווח שנבדק")

  const gamesPerRound = Math.max(...rounds.map(r => r.length))
  if (gamesPerRound > slots.length) {
    warnings.push(`${gamesPerRound} משחקים בסיבוב אך רק ${slots.length} משבצות שעה — ייתכנו התנגשויות`)
  }

  const fixtures = []
  const perTeam = Object.fromEntries(ids.map(id => [id, { home: 0, away: 0 }]))
  const perVenue = {}

  rounds.forEach((round, roundIndex) => {
    const date = dates[roundIndex]
    if (!date) return // ran out of Saturdays; `exhausted` already warned

    const withVenue = round.map(([homeId, awayId]) => ({
      homeId, awayId, venue: byId[homeId]?.home_venue || null,
    }))
    // Group same-venue games together so they take consecutive slots.
    withVenue.sort((a, b) => String(a.venue || "").localeCompare(String(b.venue || ""), "he"))

    withVenue.forEach((g, i) => {
      const time = slots[Math.min(i, slots.length - 1)]
      fixtures.push({
        round: roundIndex + 1,
        leg: roundIndex < rounds.length / 2 ? 1 : 2,
        date,
        time,
        home_team_id: g.homeId,
        away_team_id: g.awayId,
        home_team_name: byId[g.homeId]?.name || "",
        away_team_name: byId[g.awayId]?.name || "",
        venue: g.venue,
        game_date: at(date, time),
        status: "scheduled",
        game_type: "ליגה",
        season_id: seasonId,
      })
      perTeam[g.homeId].home++
      perTeam[g.awayId].away++
      if (g.venue) perVenue[g.venue] = (perVenue[g.venue] || 0) + 1
    })
  })

  // Balance is guaranteed by construction; surface it if that ever stops holding.
  const lopsided = Object.entries(perTeam)
    .filter(([, v]) => v.home !== v.away)
    .map(([id]) => byId[id]?.name)
  if (lopsided.length) warnings.push(`חלוקת בית/חוץ לא מאוזנת: ${lopsided.join(", ")}`)

  return { fixtures, skipped, rounds: rounds.length, warnings, perTeam, perVenue, exhausted }
}

/** Rows for createGames() — strips the preview-only fields. */
export function toGameRows(fixtures) {
  return fixtures.map(f => ({
    home_team_id: f.home_team_id,
    away_team_id: f.away_team_id,
    game_date: f.game_date,
    venue: f.venue,
    status: f.status,
    game_type: f.game_type,
    season_id: f.season_id,
  }))
}

export { dateKey }
