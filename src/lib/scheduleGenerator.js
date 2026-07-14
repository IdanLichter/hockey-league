// Schedule generation (Package 3). Pure functions that turn a list of team ids
// into rounds of { home, away } matchups, plus helpers to spread dates across the
// tournament and build game-insert rows. The manager reviews a preview and can
// edit every game (date, venue) afterward in the games admin.

// Round-robin via the circle method. Returns an array of rounds; each round is an
// array of { home, away } id pairs. doubleRound adds a reversed second leg (home &
// away). An odd team count gets a bye each round (that team simply doesn't play).
export function roundRobin(ids, doubleRound = false) {
  const teams = [...ids]
  if (teams.length < 2) return []
  if (teams.length % 2 === 1) teams.push(null) // bye slot
  const n = teams.length
  const arr = teams.slice()
  const rounds = []
  for (let r = 0; r < n - 1; r++) {
    const round = []
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i], b = arr[n - 1 - i]
      if (a != null && b != null) round.push(r % 2 === 0 ? { home: a, away: b } : { home: b, away: a })
    }
    if (round.length) rounds.push(round)
    arr.splice(1, 0, arr.pop()) // rotate, keeping arr[0] fixed
  }
  if (doubleRound) {
    const second = rounds.map(round => round.map(m => ({ home: m.away, away: m.home })))
    return [...rounds, ...second]
  }
  return rounds
}

// Single-elimination first round. Seeds in listed order, pads to a power of 2 with
// byes; a team paired with a bye advances (no game). Returns one round. Later
// rounds are added manually as winners emerge.
export function knockoutFirstRound(ids) {
  const teams = [...ids]
  if (teams.length < 2) return []
  let size = 1
  while (size < teams.length) size *= 2
  const seeds = [...teams]
  while (seeds.length < size) seeds.push(null)
  const round = []
  for (let i = 0; i < size / 2; i++) {
    const a = seeds[i], b = seeds[size - 1 - i]
    if (a != null && b != null) round.push({ home: a, away: b })
  }
  return round.length ? [round] : []
}

// Group stage: deal ids across numGroups, then round-robin within each group.
// Returns rounds interleaved across groups. (The knockout stage after groups is
// created manually once group results are in.)
export function groupStage(ids, numGroups) {
  const g = Math.max(1, Math.min(Math.floor(numGroups) || 1, Math.floor(ids.length / 2) || 1))
  const groups = Array.from({ length: g }, () => [])
  ids.forEach((id, i) => groups[i % g].push(id))
  const perGroup = groups.map(gr => roundRobin(gr, false))
  const maxR = Math.max(0, ...perGroup.map(r => r.length))
  const merged = []
  for (let r = 0; r < maxR; r++) {
    const round = []
    for (const gr of perGroup) if (gr[r]) round.push(...gr[r])
    if (round.length) merged.push(round)
  }
  return merged
}

// One date per round, spread across [startDate, endDate] (YYYY-MM-DD). Falls back
// to sequential days from the start (or today) when the range is missing.
export function roundDates(numRounds, startDate, endDate) {
  const start = startDate ? new Date(`${startDate}T18:00:00`) : new Date()
  const end = endDate ? new Date(`${endDate}T18:00:00`) : null
  const dates = []
  for (let r = 0; r < numRounds; r++) {
    let d
    if (end && numRounds > 1 && end.getTime() > start.getTime()) {
      d = new Date(start.getTime() + ((end.getTime() - start.getTime()) * r) / (numRounds - 1))
    } else {
      d = new Date(start.getTime() + r * 24 * 3600 * 1000)
    }
    dates.push(d)
  }
  return dates
}

// Turn rounds into game-insert rows for a tournament (game_date required by the DB).
export function buildGames(rounds, { tournamentId, startDate, endDate }) {
  const dates = roundDates(rounds.length, startDate, endDate)
  const games = []
  rounds.forEach((round, ri) => {
    for (const m of round) {
      games.push({
        home_team_id: m.home,
        away_team_id: m.away,
        game_date: dates[ri].toISOString(),
        tournament_id: tournamentId,
        status: 'scheduled',
        game_type: 'ליגה',
      })
    }
  })
  return games
}
