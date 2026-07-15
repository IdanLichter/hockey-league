// Server-side Open Graph tags for detail pages, so link unfurlers (WhatsApp,
// Facebook, Twitter, Slack, …) preview the specific player / team / game instead
// of the generic league card. Only social-bot user-agents are routed here (see
// vercel.json `rewrites`); real users and JS-rendering search engines keep
// getting the normal SPA. On any miss it falls back to the league card — never
// worse than the static index.html preview.

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://slpwwoupbbxcgjivcspv.supabase.co'
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

async function sbOne(pathAndQuery) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
  })
  if (!r.ok) return null
  const rows = await r.json()
  return Array.isArray(rows) ? rows[0] : rows
}

export default async function handler(req, res) {
  const type = String(req.query.type || '')
  const id = String(req.query.id || '')
  const site = `https://${req.headers.host || 'rinkhockeyil.com'}`
  const absImg = (u) => (!u ? `${site}/logos/main-logo.png` : /^https?:\/\//.test(u) ? u : `${site}${u.startsWith('/') ? '' : '/'}${u}`)
  const pageUrl = `${site}/${encodeURIComponent(type)}/${encodeURIComponent(id)}`

  // Fallback = the league card (same content as the static index.html tags).
  let title = 'ליגת הרולר הוקי הישראלית'
  let desc = 'ליגת רולר הוקי - טבלה, משחקים, סטטיסטיקות ועוד'
  let image = `${site}/logos/main-logo.png`

  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    if (SUPABASE_ANON && isUuid) {
      if (type === 'players') {
        const p = await sbOne(`players?id=eq.${id}&select=first_name,last_name,goals,games_played,photo_url,team:teams(name,logo_url)`)
        if (p) {
          title = `${p.first_name} ${p.last_name}`.trim()
          desc = [p.team?.name, `${p.goals || 0} שערים`, `${p.games_played || 0} משחקים`].filter(Boolean).join(' · ')
          image = absImg(p.photo_url || p.team?.logo_url)
        }
      } else if (type === 'teams') {
        const t = await sbOne(`teams?id=eq.${id}&select=name,city,logo_url,points,wins,losses,ties`)
        if (t) {
          title = t.name
          desc = [t.city, `${t.points || 0} נק׳`, `${t.wins || 0}נ ${t.ties || 0}ת ${t.losses || 0}ה`].filter(Boolean).join(' · ')
          image = absImg(t.logo_url)
        }
      } else if (type === 'games') {
        const g = await sbOne(`games?id=eq.${id}&select=game_date,home_score,away_score,status,home:teams!games_home_team_id_fkey(name,logo_url),away:teams!games_away_team_id_fkey(name,logo_url)`)
        if (g) {
          const h = g.home?.name || 'בית', a = g.away?.name || 'חוץ'
          title = `${h} נגד ${a}`
          desc = g.status === 'completed' && g.home_score != null
            ? `${h} ${g.home_score} - ${g.away_score} ${a}`
            : 'משחק בליגת הרולר הוקי הישראלית'
          image = absImg(g.home?.logo_url || g.away?.logo_url)
        }
      }
    }
  } catch { /* fall back to the league card */ }

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
  res.status(200).send(`<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"/>
<link rel="canonical" href="${esc(pageUrl)}"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="ליגת הרולר הוקי הישראלית"/>
<meta property="og:locale" content="he_IL"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(desc)}"/>
<meta property="og:url" content="${esc(pageUrl)}"/>
<meta property="og:image" content="${esc(image)}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${esc(title)}"/>
<meta name="twitter:description" content="${esc(desc)}"/>
<meta name="twitter:image" content="${esc(image)}"/>
<meta http-equiv="refresh" content="0;url=${esc(pageUrl)}"/>
</head><body><a href="${esc(pageUrl)}">${esc(title)}</a></body></html>`)
}
