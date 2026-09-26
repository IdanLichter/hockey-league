/**
 * iCalendar (.ics) for league games — shared by the subscribe feed (api/calendar.js)
 * and the per-game "add to calendar" download, so both describe a game identically.
 *
 * Dependency-free on purpose: api/ imports this file directly, and the browser bundle
 * does too.
 *
 * Times are written in UTC ("…Z"). That sidesteps shipping a VTIMEZONE block, and every
 * calendar app renders UTC instants in the viewer's own zone — which for the league is
 * Israel, DST switch included.
 *
 * UID is the game id, so when a game moves, a subscribed calendar updates the existing
 * event instead of adding a second one.
 */

export const GAME_DURATION_MIN = 90
export const CAL_NAME = 'ליגת הוקי גלגיליות'

const STATUS_LABEL = {
  scheduled: 'מתוכנן', in_progress: 'במהלך', waiting_result: 'ממתין לתוצאה',
  completed: 'הסתיים', postponed: 'נדחה',
}

// RFC 5545 §3.3.11: escape backslash, semicolon, comma; newlines become \n.
const escText = (s) => String(s ?? '')
  .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

// RFC 5545 §3.1: lines longer than 75 OCTETS are folded. Hebrew is 2 bytes per letter
// in UTF-8, so counting characters would overrun; fold on the encoded length, and never
// split inside a character.
const enc = new TextEncoder()
function fold(line) {
  if (enc.encode(line).length <= 75) return line
  const out = []
  let cur = '', curBytes = 0, limit = 75
  for (const ch of line) {
    const b = enc.encode(ch).length
    if (curBytes + b > limit) { out.push(cur); cur = ''; curBytes = 0; limit = 74 } // continuation lines carry a leading space
    cur += ch; curBytes += b
  }
  out.push(cur)
  return out.join('\r\n ')
}

const utc = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** "בלג נוער נגד בלג בוגרים" — home first, as the league writes it. */
export function gameTitle(game, teamsById) {
  const h = teamsById[game.home_team_id]?.name || 'ייקבע'
  const a = teamsById[game.away_team_id]?.name || 'ייקבע'
  return `${h} נגד ${a}`
}

function eventLines(game, teamsById, site) {
  const start = new Date(game.game_date)
  const end = new Date(start.getTime() + GAME_DURATION_MIN * 60000)
  const url = `${site}/games/${encodeURIComponent(game.slug || game.id)}`
  let summary = gameTitle(game, teamsById)
  if (game.status === 'completed' && game.home_score != null && game.away_score != null) {
    // away:home — the digits run LTR inside the RTL title, which puts the home
    // score on the right, under the home team's name (see CLAUDE.md).
    summary += ` (${game.away_score}:${game.home_score})`
  }
  const desc = [
    game.game_type && game.game_type !== 'ליגה' ? game.game_type : null,
    STATUS_LABEL[game.status] ? `סטטוס: ${STATUS_LABEL[game.status]}` : null,
    url,
  ].filter(Boolean).join('\n')

  return [
    'BEGIN:VEVENT',
    `UID:${game.id}@rinkhockeyil.com`,
    `DTSTAMP:${utc(Date.now())}`,
    `DTSTART:${utc(start)}`,
    `DTEND:${utc(end)}`,
    `SUMMARY:${escText(summary)}`,
    game.venue ? `LOCATION:${escText(`מגרש ${game.venue}`)}` : null,
    `DESCRIPTION:${escText(desc)}`,
    `URL:${url}`,
    // A postponed game stays in the feed as cancelled, so a subscriber's calendar
    // drops it instead of keeping a slot nobody will show up for.
    `STATUS:${game.status === 'postponed' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
  ].filter(Boolean)
}

/**
 * @param {object[]} games  rows with id, slug, game_date, home/away_team_id, venue, status, game_type, scores
 * @param {object}   teamsById
 * @param {{name?: string, site?: string}} opts
 * @returns {string} a complete VCALENDAR, CRLF line endings
 */
export function buildIcs(games, teamsById, { name = CAL_NAME, site = 'https://rinkhockeyil.com' } = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//rinkhockeyil.com//games//HE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escText(name)}`,
    'X-WR-TIMEZONE:Asia/Jerusalem',
    // Hint for apps that honour it (Apple, Outlook): re-fetch every few hours.
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
    ...games.filter(g => g.game_date).flatMap(g => eventLines(g, teamsById, site)),
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** Google Calendar "add this one event" link — Google can't import an .ics by click. */
export function googleEventUrl(game, teamsById, site = 'https://rinkhockeyil.com') {
  const start = new Date(game.game_date)
  const end = new Date(start.getTime() + GAME_DURATION_MIN * 60000)
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: gameTitle(game, teamsById),
    dates: `${utc(start)}/${utc(end)}`,
    details: `${site}/games/${encodeURIComponent(game.slug || game.id)}`,
    ctz: 'Asia/Jerusalem',
  })
  if (game.venue) p.set('location', `מגרש ${game.venue}`)
  return `https://calendar.google.com/calendar/render?${p}`
}
