import { useEffect } from 'react'

// Zero-dependency head manager. Every route calls useSeo() so the document title,
// description, canonical and robots directive describe the page the user is on
// rather than the generic shell in index.html.
//
// Caveat: this runs in the browser, so only JS-rendering crawlers (Googlebot) see
// per-route tags. Non-rendering scrapers — WhatsApp, Twitter — read the static
// tags in index.html. Giving them real per-page previews needs prerendering/SSG.

// Host is env-parametrized so the branded domain is one Vercel env var away
// (VITE_SITE_URL) without touching code — every canonical / OG / JSON-LD URL
// derives from it. Falls back to the current vercel.app host.
export const SITE_URL = import.meta.env.VITE_SITE_URL || 'https://hockey-league-pro.vercel.app'
export const SITE_NAME = 'ליגת הרולר הוקי הישראלית'
export const DEFAULT_DESCRIPTION = 'ליגת רולר הוקי - טבלה, משחקים, סטטיסטיקות ועוד'
const DEFAULT_IMAGE = `${SITE_URL}/logos/main-logo.png`

// Gated tooling: no public content, must never land in a search index.
export const NOINDEX_PREFIXES = ['/admin', '/judge', '/me']

function upsertMeta(selector, attr, name, content) {
  let el = document.head.querySelector(selector)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, name)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertLink(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

/**
 * @param {object} opts
 * @param {string}  [opts.title]       page title, without the site-name suffix
 * @param {string}  [opts.description]
 * @param {string}  [opts.path]        canonical path, e.g. '/players/12'
 * @param {string}  [opts.image]       absolute URL for the share preview
 * @param {boolean} [opts.noindex]     keep this URL out of search results
 */
export function useSeo({ title, description, path, image, noindex = false } = {}) {
  const fullTitle = title ? `${title} · ${SITE_NAME}` : SITE_NAME
  const desc = description || DEFAULT_DESCRIPTION
  const canonical = `${SITE_URL}${path || (typeof window !== 'undefined' ? window.location.pathname : '/')}`
  const img = image || DEFAULT_IMAGE

  useEffect(() => {
    document.title = fullTitle
    upsertMeta('meta[name="description"]', 'name', 'description', desc)
    upsertMeta('meta[name="robots"]', 'name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow')
    upsertLink('canonical', canonical)

    upsertMeta('meta[property="og:title"]', 'property', 'og:title', fullTitle)
    upsertMeta('meta[property="og:description"]', 'property', 'og:description', desc)
    upsertMeta('meta[property="og:url"]', 'property', 'og:url', canonical)
    upsertMeta('meta[property="og:image"]', 'property', 'og:image', img)

    upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', fullTitle)
    upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', desc)
    upsertMeta('meta[name="twitter:image"]', 'name', 'twitter:image', img)
  }, [fullTitle, desc, canonical, img, noindex])
}

// ---------------------------------------------------------------------------
// JSON-LD builders (schema.org). Pure functions: entity in → plain object out.
// Emitted into <head> by RouteSeo via components/JsonLd.jsx. Kept lightweight —
// only fields we actually hold, so nothing is fabricated.
// ---------------------------------------------------------------------------

const SPORT = 'Roller hockey'

/** The league itself. Emitted on the home route. */
export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsOrganization',
    name: SITE_NAME,
    sport: SPORT,
    url: `${SITE_URL}/`,
    logo: DEFAULT_IMAGE,
  }
}

/** A player. `team` optional (their SportsTeam). */
export function personJsonLd(player, team) {
  const name = `${player.first_name || ''} ${player.last_name || ''}`.trim()
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name,
    url: `${SITE_URL}/players/${player.id}`,
    ...(player.photo_url ? { image: player.photo_url } : {}),
    ...(team ? { memberOf: { '@type': 'SportsTeam', name: team.name, url: `${SITE_URL}/teams/${team.id}` } } : {}),
  }
}

/** A team. */
export function teamJsonLd(team) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsTeam',
    name: team.name,
    sport: SPORT,
    url: `${SITE_URL}/teams/${team.id}`,
    ...(team.city ? { location: { '@type': 'Place', name: team.city } } : {}),
    ...(team.founded_year ? { foundingDate: String(team.founded_year) } : {}),
    memberOf: { '@type': 'SportsOrganization', name: SITE_NAME, url: `${SITE_URL}/` },
  }
}

/** A single game. `homeTeam` / `awayTeam` optional. */
export function sportsEventJsonLd(game, homeTeam, awayTeam) {
  const home = homeTeam?.name || 'קבוצת הבית'
  const away = awayTeam?.name || 'קבוצת החוץ'
  const competitor = [
    { '@type': 'SportsTeam', name: home, ...(homeTeam ? { url: `${SITE_URL}/teams/${homeTeam.id}` } : {}) },
    { '@type': 'SportsTeam', name: away, ...(awayTeam ? { url: `${SITE_URL}/teams/${awayTeam.id}` } : {}) },
  ]
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: `${home} נגד ${away}`,
    sport: SPORT,
    url: `${SITE_URL}/games/${game.id}`,
    eventStatus: game.status === 'cancelled'
      ? 'https://schema.org/EventCancelled'
      : 'https://schema.org/EventScheduled',
    ...(game.game_date ? { startDate: game.game_date } : {}),
    ...(game.venue ? { location: { '@type': 'Place', name: game.venue } } : {}),
    competitor,
    organizer: { '@type': 'SportsOrganization', name: SITE_NAME, url: `${SITE_URL}/` },
  }
}
