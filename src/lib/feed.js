/**
 * Pure, dependency-free feed builder for the social-feed home page.
 * Derives a sorted list of "post" objects from existing league data.
 * No DB access, no side effects — safe to unit test.
 */

/**
 * Group game_stats rows by their game_id.
 * @param {Array} gameStats
 * @returns {Object} map of game_id -> array of stat rows
 */
export function groupStatsByGame(gameStats = []) {
  const byGame = {}
  for (const s of gameStats) {
    if (!byGame[s.game_id]) byGame[s.game_id] = []
    byGame[s.game_id].push(s)
  }
  return byGame
}

/**
 * Build the feed.
 * @param {Object} args
 * @param {Array} args.games
 * @param {Array} args.teams
 * @param {Array} args.players
 * @param {Array} args.gameStats
 * @param {string|null} args.championId
 * @param {string} args.seasonName
 * @param {string} args.seasonMode - 'regular' | 'final_four'
 * @returns {Array} post objects: { id, type, date, rank, data }
 */
export function buildFeed({
  games = [],
  teams = [],
  players = [],
  gameStats = [],
  championId = null,
  seasonName = '',
  seasonMode = 'regular',
} = {}) {
  const teamsMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const playersMap = Object.fromEntries(players.map(p => [p.id, p]))

  const completed = games.filter(
    g => g.status === 'completed' && g.home_score != null && g.away_score != null
  )
  const statsByGame = groupStatsByGame(gameStats)

  const posts = []

  // ---- GAME RESULT posts ----
  for (const g of completed) {
    const home = teamsMap[g.home_team_id]
    const away = teamsMap[g.away_team_id]
    posts.push({
      id: `game-${g.id}`,
      type: 'game_result',
      date: g.game_date,
      rank: 2,
      data: { game: g, home, away, stats: statsByGame[g.id] || [] },
    })

    // ---- MILESTONE posts (aggregate goals per scorer from this game) ----
    const scorers = {}
    for (const s of (statsByGame[g.id] || [])) {
      const goals = s.goals || 0
      if (goals <= 0) continue
      const key = s.player_id ? `p${s.player_id}` : `g${s.guest_player_name}`
      if (!scorers[key]) {
        const player = s.player_id ? playersMap[s.player_id] : null
        const team = player ? teamsMap[player.team_id] : null
        scorers[key] = {
          key,
          goals: 0,
          player,
          team,
          name: player
            ? `${player.first_name} ${player.last_name}`
            : (s.guest_player_name || ''),
          teamName: team ? team.name : (s.guest_player_original_team || ''),
        }
      }
      scorers[key].goals += goals
    }

    for (const sc of Object.values(scorers)) {
      if (sc.goals < 3) continue
      posts.push({
        id: `ms-${g.id}-${sc.key}`,
        type: 'milestone',
        date: g.game_date,
        rank: 1,
        data: {
          kind: sc.goals >= 5 ? 'big_game' : 'hat_trick',
          name: sc.name,
          team: sc.team,
          teamName: sc.teamName,
          goals: sc.goals,
          game: g,
          home,
          away,
        },
      })
    }
  }

  // ---- Determine last game date (for champion / top-scorer synthetic dates) ----
  let lastGameTime = null
  for (const g of completed) {
    const t = new Date(g.game_date).getTime()
    if (!isNaN(t) && (lastGameTime == null || t > lastGameTime)) lastGameTime = t
  }
  if (lastGameTime == null) lastGameTime = Date.now()
  const DAY = 24 * 60 * 60 * 1000

  // ---- CHAMPION post ----
  if (seasonMode === 'final_four' && championId && teamsMap[championId]) {
    posts.push({
      id: 'champion',
      type: 'champion',
      date: new Date(lastGameTime + DAY).toISOString(),
      rank: 100,
      data: { team: teamsMap[championId], seasonName },
    })
  }

  // ---- TOP SCORER post (authoritative season total from players.goals) ----
  const topScorer = players
    .filter(p => p.position === 'Field Player' && (p.goals || 0) > 0)
    .reduce((best, p) => ((p.goals || 0) > (best?.goals || 0) ? p : best), null)
  if (topScorer) {
    // 1 second earlier than the champion so the champion sorts first on the same day.
    posts.push({
      id: 'top-scorer',
      type: 'top_scorer',
      date: new Date(lastGameTime + DAY - 1000).toISOString(),
      rank: 90,
      data: {
        player: topScorer,
        team: teamsMap[topScorer.team_id],
        goals: topScorer.goals || 0,
      },
    })
  }

  // ---- Sort: date DESC, then rank DESC ----
  posts.sort((a, b) => {
    const dt = new Date(b.date).getTime() - new Date(a.date).getTime()
    if (dt !== 0) return dt
    return b.rank - a.rank
  })

  return posts
}
