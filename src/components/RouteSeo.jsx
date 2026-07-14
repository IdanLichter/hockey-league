import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import {
  useSeo, NOINDEX_PREFIXES,
  organizationJsonLd, personJsonLd, teamJsonLd, sportsEventJsonLd,
} from '@/lib/seo'
import { upsertJsonLd, removeJsonLd } from '@/components/JsonLd'
import { trackPageview } from '@/lib/analytics'
import { supabase } from '@/lib/supabase'

// Per-route metadata for the static pages. Detail pages (/players/:id, /teams/:id)
// call useSeo() themselves with the entity's name; because this component renders
// before <Routes>, their effect runs after this one and wins.
const ROUTES = {
  '/': { title: 'המגרש', description: 'עדכונים, תוצאות ורגעים מליגת הרולר הוקי הישראלית' },
  '/standings': { title: 'טבלת הליגה', description: 'טבלת הדירוג המלאה של ליגת הרולר הוקי הישראלית' },
  '/games': { title: 'משחקים', description: 'לוח המשחקים והתוצאות של ליגת הרולר הוקי' },
  '/statistics': { title: 'סטטיסטיקות', description: 'מלכי השערים, כרטיסים ושערים נקיים בליגת הרולר הוקי' },
  '/teams': { title: 'קבוצות', description: 'כל הקבוצות בליגת הרולר הוקי הישראלית' },
  '/players': { title: 'שחקנים', description: 'כל השחקנים בליגת הרולר הוקי הישראלית' },
  '/media': { title: 'מדיה', description: 'תמונות ורגעים מהמשחקים' },
  '/final-four': { title: 'פיינל פור', description: 'שלב הפיינל פור של ליגת הרולר הוקי' },
  '/tournaments': { title: 'טורנירים', description: 'טורנירים לקבוצות הנוער בליגת הרולר הוקי הישראלית' },
  '/app': { title: 'הורדת האפליקציה', description: 'האפליקציה הרשמית של ליגת הרולר הוקי — טבלה, משחקים וסטטיסטיקות ל-iOS ו-Android' },
  '/creators': { title: 'אזור יוצרי תוכן', description: 'אזור יוצרי התוכן של ליגת הרולר הוקי הישראלית' },
  '/archive': { title: 'ארכיון', description: 'עונות קודמות של ליגת הרולר הוקי הישראלית' },
  '/privacy': { title: 'מדיניות פרטיות' },
}

// Single keyed <script type="application/ld+json"> managed per route.
const JSONLD_KEY = 'route'

export default function RouteSeo() {
  const { pathname } = useLocation()
  const noindex = NOINDEX_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`))
  const meta = ROUTES[pathname] || {}
  useSeo({ ...meta, path: pathname, noindex })

  // GA4 page_view on SPA navigation. rAF defers a frame so a detail page's own
  // useSeo() has set the real document.title before we read it. Dormant (no-op)
  // unless VITE_GA4_ID is set.
  useEffect(() => {
    const raf = requestAnimationFrame(() => trackPageview(pathname))
    return () => cancelAnimationFrame(raf)
  }, [pathname])

  // Structured data: SportsOrganization on home; Person / SportsTeam /
  // SportsEvent on the detail routes. Detail entities are fetched with a small
  // anon query (a few columns) — best-effort, never blocks or breaks render.
  useEffect(() => {
    let alive = true

    if (pathname === '/') {
      upsertJsonLd(JSONLD_KEY, organizationJsonLd())
      return () => { removeJsonLd(JSONLD_KEY) }
    }

    const playerId = pathname.match(/^\/players\/([^/]+)$/)?.[1]
    const teamId = pathname.match(/^\/teams\/([^/]+)$/)?.[1]
    const gameId = pathname.match(/^\/games\/([^/]+)$/)?.[1]

    async function run() {
      try {
        if (playerId) {
          const { data: p } = await supabase
            .from('players').select('id, first_name, last_name, team_id, photo_url')
            .eq('id', playerId).maybeSingle()
          if (!alive || !p) return
          let team = null
          if (p.team_id) {
            const { data } = await supabase.from('teams').select('id, name').eq('id', p.team_id).maybeSingle()
            team = data
          }
          if (alive) upsertJsonLd(JSONLD_KEY, personJsonLd(p, team))
        } else if (teamId) {
          const { data: t } = await supabase
            .from('teams').select('id, name, city, founded_year')
            .eq('id', teamId).maybeSingle()
          if (alive && t) upsertJsonLd(JSONLD_KEY, teamJsonLd(t))
        } else if (gameId) {
          const { data: g } = await supabase
            .from('games').select('id, home_team_id, away_team_id, game_date, venue, status')
            .eq('id', gameId).maybeSingle()
          if (!alive || !g) return
          const ids = [g.home_team_id, g.away_team_id].filter(Boolean)
          const { data: ts } = ids.length
            ? await supabase.from('teams').select('id, name').in('id', ids)
            : { data: [] }
          const map = Object.fromEntries((ts || []).map(t => [t.id, t]))
          if (alive) upsertJsonLd(JSONLD_KEY, sportsEventJsonLd(g, map[g.home_team_id], map[g.away_team_id]))
        }
      } catch {
        /* structured data is best-effort — a Supabase blip must never break the page */
      }
    }

    run()
    return () => { alive = false; removeJsonLd(JSONLD_KEY) }
  }, [pathname])

  return null
}
