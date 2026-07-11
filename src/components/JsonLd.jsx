import { useEffect } from 'react'

// Injects <script type="application/ld+json"> structured data into <head>.
//
// Client-side this only reaches JS-running crawlers (Googlebot); the prerender
// step snapshots the finished <head> so non-JS crawlers see it too. Each node is
// keyed by a data-attribute so a route can replace its own graph without
// clobbering another's.

const ATTR = 'data-jsonld'

export function upsertJsonLd(key, data) {
  if (typeof document === 'undefined' || !data) return
  const list = Array.isArray(data) ? data : [data]
  let el = document.head.querySelector(`script[${ATTR}="${key}"]`)
  if (!el) {
    el = document.createElement('script')
    el.type = 'application/ld+json'
    el.setAttribute(ATTR, key)
    document.head.appendChild(el)
  }
  el.textContent = JSON.stringify(
    list.length === 1 ? list[0] : { '@context': 'https://schema.org', '@graph': list }
  )
}

export function removeJsonLd(key) {
  if (typeof document === 'undefined') return
  const el = document.head.querySelector(`script[${ATTR}="${key}"]`)
  if (el) el.remove()
}

/**
 * Declarative helper for any page that already holds its entity: <JsonLd data={teamJsonLd(team)} />.
 * Renders nothing; manages one keyed <script> and removes it on unmount.
 */
export default function JsonLd({ id = 'page', data }) {
  useEffect(() => {
    upsertJsonLd(id, data)
    return () => removeJsonLd(id)
  }, [id, data])
  return null
}
