import { useEffect } from 'react'

// Zero-dependency head manager. Every route calls useSeo() so the document title,
// description, canonical and robots directive describe the page the user is on
// rather than the generic shell in index.html.
//
// Caveat: this runs in the browser, so only JS-rendering crawlers (Googlebot) see
// per-route tags. Non-rendering scrapers — WhatsApp, Twitter — read the static
// tags in index.html. Giving them real per-page previews needs prerendering/SSG.

export const SITE_URL = 'https://hockey-league-pro.vercel.app'
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
