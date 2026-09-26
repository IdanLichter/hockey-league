/**
 * The league's playoff rules, as pure functions of teams + games. The bracket on the
 * standings page renders what this returns; scripts/check-playoffs.mjs pins the rules.
 *
 * The format (2026-27, as the league runs it):
 *  - #1 in the regular season goes straight to the semi-finals.
 *  - #2–#7 play three series: 2 v 7, 3 v 6, 4 v 5. Two games each (playoff_round
 *    'first_round', series_game 1 and 2). More WINS goes through; goals don't count.
 *    A win + a draw is 1–0 in wins, so that team goes through. If wins are level
 *    (1–1, or two draws), game 3 — the הכרעה (series_game 3) — decides it.
 *  - Semi-finals: ONE game each. Who meets whom is decided by the league at the time,
 *    so it is never computed here — the bracket shows whatever semi games exist.
 *  - Final and 3rd-place game: one game each.
 *  - The three series losers play each other once (playoff_round 'placement') for
 *    places 5–7, ranked like the league table: points, goal difference, goals for.
 *
 * Draws can happen in a single game, and how a drawn semi/final is settled is decided
 * on the day. So a drawn knockout game is resolved from what happened NEXT: the semi
 * winner is whichever team the league put in the final; the final's winner is the
 * champion the admin recorded (league_settings.champion_team_id).
 */

export const LEAGUE = 'ליגה'
export const PLAYOFF = 'פלייאוף'
export const ROUND = {
  series: 'first_round', semi: 'semi_final', final: 'final',
  third: 'third_place', placement: 'placement',
}
export const SERIES_PAIRS = [[2, 7, 'A'], [3, 6, 'B'], [4, 5, 'C']]

// Standings order — points, goal difference, goals for (same as utils.standingsComparator,
// kept here so this file has no imports and runs under plain node).
export function tableOrder(a, b) {
  const p = (b.points || 0) - (a.points || 0)
  if (p) return p
  const d = ((b.goals_for || 0) - (b.goals_against || 0)) - ((a.goals_for || 0) - (a.goals_against || 0))
  if (d) return d
  return (b.goals_for || 0) - (a.goals_for || 0)
}

const done = (g) => g.status === 'completed' && g.home_score != null && g.away_score != null
const involves = (g, id) => g.home_team_id === id || g.away_team_id === id
const between = (g, a, b) => (g.home_team_id === a && g.away_team_id === b) || (g.home_team_id === b && g.away_team_id === a)
const byDate = (a, b) => new Date(a.game_date) - new Date(b.game_date)

/** Winner id of one completed game, null for a draw or an unplayed game. */
export function gameWinner(g) {
  if (!g || !done(g) || g.home_score === g.away_score) return null
  return g.home_score > g.away_score ? g.home_team_id : g.away_team_id
}

/**
 * Is #1 already certain? True when nobody can catch the leader even by winning every
 * remaining league game. "Catch" includes drawing level: a tie on points is broken by
 * goals, which can still change, so level-on-max is NOT clinched.
 */
export function leaderClinched(teams, leagueGames) {
  if (teams.length < 2) return false
  const sorted = [...teams].sort(tableOrder)
  const leader = sorted[0]
  const remaining = (id) => leagueGames.filter(g => involves(g, id) && !done(g)).length
  return sorted.slice(1).every(t => (t.points || 0) + 3 * remaining(t.id) < (leader.points || 0))
}

/** The regular season is over: there were league games and every one is completed. */
export function regularSeasonOver(leagueGames) {
  return leagueGames.length > 0 && leagueGames.every(done)
}

/**
 * One series' state.
 * @returns {{games, wins:{[id]:number}, winner:string|null, needsDecider:boolean,
 *            deciderUnneeded:boolean}}
 */
export function seriesState(t1, t2, playoffGames, nextRoundGames = []) {
  const games = playoffGames
    .filter(g => (g.playoff_round === ROUND.series || !g.playoff_round) && between(g, t1, t2))
    .sort((a, b) => (a.series_game ?? 99) - (b.series_game ?? 99) || byDate(a, b))
  const legs = games.filter(g => g.series_game !== 3).slice(0, 2)
  const decider = games.find(g => g.series_game === 3) || games[2] || null
  const wins = { [t1]: 0, [t2]: 0 }
  for (const g of legs) { const w = gameWinner(g); if (w) wins[w]++ }

  const legsDone = legs.length === 2 && legs.every(done)
  let winner = null
  if (legsDone && wins[t1] !== wins[t2]) {
    winner = wins[t1] > wins[t2] ? t1 : t2
  }
  const needsDecider = legsDone && wins[t1] === wins[t2]
  if (needsDecider && decider) winner = gameWinner(decider)
  // A drawn decider is settled on the day; the team that shows up in a semi went through.
  if (needsDecider && !winner && decider && done(decider)) {
    const semi = nextRoundGames.find(g => involves(g, t1) || involves(g, t2))
    if (semi) winner = involves(semi, t1) ? t1 : t2
  }
  return { games, wins, winner, needsDecider, deciderUnneeded: !!winner && !needsDecider && !!decider }
}

/** A single knockout game: its winner, falling back to who appears in `nextGames` (or `fallbackId`). */
function knockout(game, nextGames = [], fallbackId = null) {
  if (!game) return { game: null, winner: null, loser: null }
  let winner = gameWinner(game)
  if (!winner && done(game)) {
    const next = nextGames.find(g => involves(g, game.home_team_id) || involves(g, game.away_team_id))
    if (next) winner = involves(next, game.home_team_id) ? game.home_team_id : game.away_team_id
    else if (fallbackId && involves(game, fallbackId)) winner = fallbackId
  }
  const loser = winner ? (winner === game.home_team_id ? game.away_team_id : game.home_team_id) : null
  return { game, winner, loser }
}

/** Mini-table of the placement games among `ids`, ordered points → goal diff → goals for. */
export function placementTable(ids, placementGames) {
  const rows = Object.fromEntries(ids.map(id => [id, { id, points: 0, goals_for: 0, goals_against: 0, played: 0 }]))
  for (const g of placementGames) {
    if (!done(g) || !rows[g.home_team_id] || !rows[g.away_team_id]) continue
    const h = rows[g.home_team_id], a = rows[g.away_team_id]
    h.played++; a.played++
    h.goals_for += g.home_score; h.goals_against += g.away_score
    a.goals_for += g.away_score; a.goals_against += g.home_score
    if (g.home_score > g.away_score) h.points += 3
    else if (g.home_score < g.away_score) a.points += 3
    else { h.points++; a.points++ }
  }
  return Object.values(rows).sort(tableOrder)
}

/**
 * Everything the bracket needs.
 * @param teams      senior teams of the current season (with points etc.)
 * @param games      all games the page loaded
 * @param championId league_settings.champion_team_id, or null
 */
export function buildPlayoffs(teams, games, championId = null) {
  const league = games.filter(g => g.game_type === LEAGUE && !g.tournament_id)
  const po = games.filter(g => g.game_type === PLAYOFF && !g.tournament_id)
  const table = [...teams].sort(tableOrder)
  const seasonOver = regularSeasonOver(league)
  const clinched = seasonOver || leaderClinched(teams, league)
  const visible = clinched || po.length > 0 || !!championId

  const semiGames = po.filter(g => g.playoff_round === ROUND.semi).sort(byDate)
  const finalGame = po.filter(g => g.playoff_round === ROUND.final).sort(byDate)[0] || null
  const thirdGame = po.filter(g => g.playoff_round === ROUND.third).sort(byDate)[0] || null
  const placementGames = po.filter(g => g.playoff_round === ROUND.placement)

  const first = clinched ? table[0] || null : null
  // Seeds 2–7 are only known once the table is final.
  const seed = (n) => (seasonOver && table.length >= 7 ? table[n - 1] : null)
  const series = SERIES_PAIRS.map(([p1, p2, key]) => {
    const t1 = seed(p1), t2 = seed(p2)
    const st = t1 && t2 ? seriesState(t1.id, t2.id, po, semiGames) : null
    return { key, p1, p2, t1, t2, ...(st || { games: [], wins: {}, winner: null, needsDecider: false, deciderUnneeded: false }) }
  })

  // The semi #1 plays in goes on #1's side of the bracket.
  const semis = semiGames.slice(0, 2)
  if (first && semis[1] && involves(semis[1], first.id)) semis.reverse()
  const finalNext = finalGame ? [finalGame] : []
  const semiResults = [0, 1].map(i => knockout(semis[i] || null, finalNext))
  const final = knockout(finalGame, [], championId)
  const third = knockout(thirdGame)

  // Final ranking — filled in as each piece is decided.
  const losers = series.map(s => (s.winner ? (s.winner === s.t1?.id ? s.t2?.id : s.t1?.id) : null))
  const placements = losers.every(Boolean) ? placementTable(losers, placementGames) : []
  const placementsDone = placements.length === 3 && placements.every(r => r.played === 2)
  const ranking = [
    final.winner || championId || null,
    final.winner ? final.loser : null,
    third.winner,
    third.loser,
    ...(placementsDone ? placements.map(r => r.id) : [null, null, null]),
  ]

  return {
    visible, clinched, seasonOver, first, series,
    semis: semiResults, final, third, placements, placementsDone, ranking,
    champion: final.winner || championId || null,
  }
}
