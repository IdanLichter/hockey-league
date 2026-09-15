# External rink-hockey sources

Scouted 2026-09-15. Every feed below was fetched and parsed, not just found in a
search. Rink hockey only — no ice hockey, no inline.

## In use (`supabase/functions/ingest-rink-hockey-news`)

| Source | Feed | Volume (measured) | Image | Lang |
|---|---|---|---|---|
| WSE Rink Hockey TV (official WSE committee channel) | `youtube.com/feeds/videos.xml?channel_id=UCjUBgw3RIYYbivfVcXP83Yg` | 15-item window, ~2/wk in season | `media:thumbnail` | EN |
| OKLIGA.TV (Spanish league) | `…?channel_id=UC6RLLzXQJWy1yCAEysy1Wgw` | 15-item window, per matchday Dec–Jun | `media:thumbnail` | ES |
| World Skate Europe | `europe.worldskate.org/category/rink-hockey/feed/` | 10-item window; 10 items in 9 days during the Euros | none | EN |

The two YouTube feeds were picked over higher-volume written sources because they
are the only ones carrying a thumbnail in the feed itself, they're official (no
copyright question), and the app already embeds YouTube elsewhere.

## Rejected, with the reason

- **RFEP / fep.es** (Spanish federation, owns OK Liga) — no RSS anywhere, and the
  news list carries **no dates at all**, so items can't be placed on a timeline.
- **FISR** (Italy) — the Joomla feed works but is all roller sports; artistic
  skating dominates and "hockey pista" would need keyword filtering.
- **Mundo Deportivo** (`mundodeportivo.com/rss/hockey-patines`) — works, and by far
  the highest volume (100 items, 44 in May 2026 alone), but it's a commercial
  outlet (title + link only, never `content:encoded`) and is heavily Barça-centric
  rather than sport-wide. Viable if written news is wanted later.
- **FPP** (`fpp.pt/category/hp/feed/`) — works, ~1 item per 5 days, Portuguese, no
  images. The best candidate to add next.
- **hockeyimpact.es** — 403s automated fetches. **hoqueiempatins.pt** — no feed.

## Second pass (2026-09-15): tactics / coaching

Asked for tactical and coaching content, not just media. The short answer is that
rink-hockey tactics is not published as a feed — the good material is either paid,
dead, or hand-made. What was checked:

| Candidate | Verdict |
|---|---|
| **Andi Colaianni** (YouTube `UCh-040jKgwZpAMuMxww_V3g`) | **The one real find.** Genuine tactical breakdowns ("resolver el 2x1", "pase y voy"), free, thumbnails in the feed. Caveats: one coach's personal channel, he sells clinics on it, Spanish, and it goes quiet for months (last post Mar 2026). |
| **patinesychuecas.com** (`/feed/`) | Active daily rink-hockey blog (Chile/LatAm, currently on WSG Asunción 2026). News rather than tactics, but it has a tactical article series. No images. Some skateboarding/artistic-skating posts would need filtering. |
| hockeypatines.com | Best *content* match — video analysis of rink hockey plays + coach training — but **no RSS at all**, and it's a paid membership product. |
| Coach-Helper (200 drills) | Paid product. |
| andicolaianni.com (site RSS) | Works, but it's clinic marketing for Catalonia; last post Feb 2026. |
| todoseentrena.com | Sports psychology, not rink-hockey-specific. |
| quintanalhockey.blogspot.com | Real tactical writing — **dead since 2020**. |
| hoqueipatins2.blogspot.com | **Dead since 2011**. |
| "Hockey Training" (`UCRS46UDJteeQWOCMnMJH6DA`) | **ICE hockey** (NHL, McDavid). Search results conflate the three hockeys constantly. |
| "Hockey Ejercicios" (`UCI7OTOwNYCxD02aK0mA7EFA`) | **FIELD hockey** (hockey hierba, Red Lions). Same trap. |

Automated discovery via YouTube search was considered and is blocked: the project's
Gemini key is an `AQ.`-style express key, and the YouTube Data API rejects it
("API keys are not supported by this API"). A classic `AIza…` key with YouTube Data
API v3 enabled would allow a search → Gemini-classify → post pipeline.

## Things that bit, or would have

- **Every RSS window is 10–15 items.** WSE Europe published 10 items in 9 days
  during the Euros; a weekly poll would drop items off the end of the window
  unnoticed. Hence a daily cron.
- **Volume is bursty, not steady.** Mundo Deportivo: 44 items in May, 5 in August.
  World Skate's global feed: ~6 items *per year*. Hence the per-source and
  per-run caps, so a tournament can't flood a single day's feed.
- **Nothing is in Hebrew.** Translation is an optional layer: without
  `ANTHROPIC_API_KEY` set on the function, items still post, under their original
  English/Spanish headline.
