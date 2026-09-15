// ============================================================================
// ingest-rink-hockey-news — pull rink-hockey items from three vetted external
// feeds and post them to the league feed as rows in public.posts.
//
// Called by pg_cron (job `rink-hockey-news`, daily), NOT by end users. Auth is
// the service-role key in the Authorization header, so verify_jwt stays ON.
//
// Why these three sources (scouted 2026-09-15, see docs/rink-hockey-sources.md):
//   • WSE Rink Hockey TV + OKLIGA.TV — the only sources that carry a thumbnail
//     in the feed itself, and video is what people actually open.
//   • World Skate Europe — the governing body's own written news.
// Every other candidate was rejected: the Spanish federation publishes no dates
// at all, FISR mixes in artistic skating, Mundo Deportivo is a commercial outlet.
//
// Volume control matters more here than throughput. These feeds are BURSTY — WSE
// Europe published 10 items in 9 days during the Euros and nothing for weeks
// after — so a run is capped per source and per run, and anything older than
// MAX_AGE_DAYS is dropped. That also makes the very first run safe: it posts a
// handful of recent items instead of dumping a 35-item backlog into the feed.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!; // auto-injected
// OPTIONAL. Without it, items post under their original English/Spanish title
// (see translateToHebrew) — the ingest still works, it just reads less well.
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_MODEL = "gemini-3.5-flash";

const admin = createClient(SB_URL, SB_SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---- Tuning ---------------------------------------------------------------
const MAX_AGE_DAYS = 14;        // older than this is not news
const MAX_NEW_PER_SOURCE = 3;   // a tournament burst trickles in over days
const MAX_NEW_PER_RUN = 8;      // ...and never floods a single day's feed

const BOT_EMAIL = "news-bot@rinkhockeyil.com";
const BOT_NAME = "חדשות הוקי גלגיליות";

type Source = {
  key: string;
  kind: "youtube" | "rss";
  name: string;      // shown on the card as the source chip
  url: string;
  // RSS only: drop an item carrying any of these <category> tags. Some rink-hockey
  // outlets also cover the other roller sports under the same feed.
  excludeCategories?: string[];
};

const SOURCES: Source[] = [
  {
    key: "wse-tv",
    kind: "youtube",
    name: "WSE Rink Hockey TV",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCjUBgw3RIYYbivfVcXP83Yg",
  },
  {
    key: "okliga-tv",
    kind: "youtube",
    name: "OKLIGA.TV",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UC6RLLzXQJWy1yCAEysy1Wgw",
  },
  {
    key: "wse-news",
    kind: "rss",
    name: "World Skate Europe",
    url: "https://europe.worldskate.org/category/rink-hockey/feed/",
  },
  {
    // Coaching and tactics — the one source of its kind that publishes a feed at
    // all (see docs/rink-hockey-sources.md). Sporadic: months can pass silently.
    key: "colaianni",
    kind: "youtube",
    name: "Andi Colaianni",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCh-040jKgwZpAMuMxww_V3g",
  },
  {
    // Chilean/LatAm rink hockey, the most prolific source here (near-daily).
    // Its feed also carries speed skating, artistic skating and skateboarding,
    // which is what excludeCategories is for.
    key: "patinesychuecas",
    kind: "rss",
    name: "Patines y Chuecas",
    url: "https://patinesychuecas.com/feed/",
    excludeCategories: ["Patinaje Artístico", "Patín Carrera", "Skate", "skateboarding"],
  },
];

// ---- Minimal feed parsing --------------------------------------------------
// These are small, well-formed RSS/Atom documents; Deno has no built-in XML
// parser and pulling one in for four fields is not worth the dependency.

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")   // last: otherwise "&amp;#39;" decodes in two passes
    .trim();
}

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeEntities(m[1]) : null;
}

function attr(xml: string, tagName: string, attrName: string): string | null {
  const m = xml.match(new RegExp(`<${tagName}[^>]*\\s${attrName}="([^"]+)"`, "i"));
  return m ? decodeEntities(m[1]) : null;
}

// First <img src> inside the item's HTML body (content:encoded or description).
function firstImage(xml: string): string | null {
  const m = xml.match(/<img[^>]+src="([^"]+)"/i);
  return m ? decodeEntities(m[1]) : null;
}

function parseCategories(xml: string): string[] {
  return [...xml.matchAll(/<category>([\s\S]*?)<\/category>/gi)].map((m) => decodeEntities(m[1]));
}

type Item = { guid: string; title: string; link: string; published: Date; image: string | null; categories: string[] };

function parseFeed(xml: string, src: Source): Item[] {
  // Each block MUST be cut at its own closing tag. Splitting alone leaves every
  // block running to the end of the document, so an entry missing a field (a
  // video with no thumbnail, say) would silently inherit the NEXT entry's.
  const name = src.kind === "youtube" ? "entry" : "item";
  const blocks = xml.split(`<${name}`).slice(1)
    .map((b) => b.split(`</${name}>`)[0]);

  const out: Item[] = [];
  for (const b of blocks) {
    const title = tag(b, "title");
    if (!title) continue;

    let guid: string | null, link: string | null, dateStr: string | null, image: string | null;
    if (src.kind === "youtube") {
      const videoId = tag(b, "yt:videoId");
      guid = videoId ? `yt:${videoId}` : null;
      link = videoId ? `https://www.youtube.com/watch?v=${videoId}` : attr(b, "link", "href");
      dateStr = tag(b, "published");
      image = attr(b, "media:thumbnail", "url");
    } else {
      link = tag(b, "link");
      guid = tag(b, "guid") || link;
      dateStr = tag(b, "pubDate");
      // Neither WSE Europe nor Patines y Chuecas ships an enclosure, but both
      // embed the article's lead image in the HTML body — so pull the first <img>
      // rather than scraping og:image with an extra request per item.
      image = attr(b, "media:content", "url") || attr(b, "enclosure", "url") || firstImage(b);
    }
    if (!guid || !link || !dateStr) continue;

    const published = new Date(dateStr);
    if (Number.isNaN(published.getTime())) continue;

    const categories = src.kind === "rss" ? parseCategories(b) : [];
    if (src.excludeCategories?.some((c) => categories.includes(c))) continue;

    out.push({ guid: `${src.key}:${guid}`, title, link, published, image, categories });
  }
  return out.sort((a, b) => b.published.getTime() - a.published.getTime());
}

// ---- Hebrew ---------------------------------------------------------------
// Headlines arrive in English (WSE) and Spanish (OK Liga). Untranslated they sit
// badly next to the rest of an all-Hebrew feed — but a missing key must degrade,
// not fail: the item still posts, under its original title.
async function translateToHebrew(title: string): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;
  const system =
    "You translate rink hockey (הוקי גלגיליות) headlines into natural Hebrew for an Israeli league app. " +
    "Rink hockey vocabulary: ball not puck, הוקי גלגיליות not הוקי קרח. " +
    "Keep team and country names in their familiar Hebrew form. " +
    // RTL bidi reorders a digit run sitting between Hebrew words, which can make a
    // scoreline read as if the wrong team won (the league's standing RTL score rule).
    "If the headline contains a scoreline, keep the two team names and the score together as one " +
    'unbroken Latin-script run (e.g. "HC Liceo 8-2 Igualada") rather than splitting the digits between Hebrew words. ' +
    "Output ONLY the translated headline, no quotes, no commentary.";
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": GEMINI_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: title }] }],
          // maxOutputTokens must leave room for this model's reasoning tokens as well as
          // the answer — too tight and it returns MAX_TOKENS with an EMPTY text part.
          generationConfig: { temperature: 0.2, maxOutputTokens: 2000 },
        }),
      },
    );
    if (!res.ok) throw new Error(`gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p: { text?: string }) => p.text ?? "").join("").trim();
    return text || null;
  } catch (err) {
    console.error("translate failed, falling back to source title:", err);
    return null;
  }
}

// ---- Bot author ------------------------------------------------------------
// posts.author_id → profiles.id → auth.users.id, so external news needs a real
// account. Provisioned here rather than by hand so there is no service-role key
// to pass around and no undocumented manual step before the first run.
async function ensureBotAuthor(): Promise<string> {
  const { data: existing, error } = await admin
    .from("profiles").select("id").eq("is_bot", true).limit(1).maybeSingle();
  if (error) throw error;
  if (existing) return existing.id;

  const password = crypto.randomUUID() + crypto.randomUUID(); // never used to sign in
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: BOT_EMAIL, password, email_confirm: true,
    user_metadata: { display_name: BOT_NAME },
  });
  if (createErr || !created?.user) throw createErr ?? new Error("bot user not created");

  // The handle_new_user trigger inserts the profiles row; set the bot fields on it.
  const { error: upErr } = await admin.from("profiles")
    .upsert({ id: created.user.id, display_name: BOT_NAME, is_bot: true }, { onConflict: "id" });
  if (upErr) throw upErr;
  return created.user.id;
}

// ---- Ingest ----------------------------------------------------------------
async function ingestSource(src: Source, authorId: string, budget: number, dryRun: boolean, maxAgeDays: number) {
  const res = await fetch(src.url, {
    headers: { "user-agent": "rinkhockeyil-feed-bot/1.0 (+https://rinkhockeyil.com)" },
  });
  if (!res.ok) throw new Error(`${src.key}: HTTP ${res.status}`);

  const items = parseFeed(await res.text(), src);
  const cutoff = Date.now() - maxAgeDays * 86_400_000;
  const fresh = items.filter((i) => i.published.getTime() >= cutoff);

  // One round-trip to find which of these we already have. Soft-deleted rows keep
  // their external_guid, so an item a moderator removed stays removed.
  const { data: seen, error: seenErr } = await admin
    .from("posts").select("external_guid").in("external_guid", fresh.map((i) => i.guid));
  if (seenErr) throw seenErr;
  const seenSet = new Set((seen ?? []).map((r) => r.external_guid));

  const todo = fresh.filter((i) => !seenSet.has(i.guid))
    .slice(0, Math.min(MAX_NEW_PER_SOURCE, budget));

  const posted: string[] = [];
  const preview: unknown[] = [];
  for (const item of todo) {
    const hebrew = await translateToHebrew(item.title);
    const headline = hebrew ?? item.title;
    // The link is in the body as well as link_url on purpose: the native apps
    // render body text only, so without it an item would be unopenable there.
    // Headline first. It used to open with a per-source lead sentence ("🎥 סרטון
    // חדש · …"), which made two videos from the same event look like the same post
    // twice — the source is already on the card as a chip. The trailing lines are
    // for the native apps, which render body text only and would otherwise have no
    // source and no way to open the item; the web card hides everything after the
    // first paragraph.
    const body = `${headline}\n\n${src.name}\n${item.link}`;

    if (dryRun) {
      preview.push({ guid: item.guid, published: item.published.toISOString(), body, image: item.image });
      continue;
    }

    const { error } = await admin.from("posts").upsert({
      author_id: authorId,
      body: body.slice(0, 2000),           // posts.body CHECK: 1..2000
      source_name: src.name,
      link_url: item.link,
      image_url: item.image,
      external_guid: item.guid,
      created_at: item.published.toISOString(), // sort by when it was published, not ingested
    }, { onConflict: "external_guid", ignoreDuplicates: true });
    if (error) { console.error(`${src.key}: insert failed`, error); continue; }
    posted.push(item.guid);
  }
  return { source: src.key, fetched: items.length, fresh: fresh.length, posted, preview };
}

Deno.serve(async (req) => {
  try {
    // verify_jwt is NOT enough on its own: the anon key is a valid JWT and it is
    // public by design, so anyone could trigger an ingest. The caller must present
    // the service-role key itself — which is what pg_cron sends from the vault.
    const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (bearer !== SB_SERVICE_ROLE) {
      return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    // { "dry_run": true } parses the feeds and reports what WOULD post, writing
    // nothing. The feed is public and reaches the native apps — verify first.
    // `max_age_days` widens the freshness window for a one-off backfill (these
    // feeds go quiet for weeks between tournaments, so the daily 14-day window
    // legitimately finds nothing most of the year). Cron never sends it.
    let dryRun = false;
    let maxAgeDays = MAX_AGE_DAYS;
    let only: string[] | null = null;
    try {
      const body = await req.json();
      dryRun = !!body?.dry_run;
      if (Number.isFinite(body?.max_age_days)) maxAgeDays = Math.min(Number(body.max_age_days), 400);
      // `only: ["colaianni"]` restricts the run to named sources. Cron never sends
      // it; it exists so one source can be seeded or debugged without the shared
      // per-run budget being spent by whichever source is listed first.
      if (Array.isArray(body?.only) && body.only.length) only = body.only.map(String);
    } catch { /* no body → a normal cron run */ }

    const authorId = dryRun ? "dry-run" : await ensureBotAuthor();
    const report = [];
    let budget = MAX_NEW_PER_RUN;

    for (const src of SOURCES) {
      if (only && !only.includes(src.key)) continue;
      if (budget <= 0) { report.push({ source: src.key, skipped: "run budget spent" }); continue; }
      try {
        const r = await ingestSource(src, authorId, budget, dryRun, maxAgeDays);
        budget -= (dryRun ? r.preview.length : r.posted.length);
        report.push(r);
      } catch (err) {
        // One dead feed must not stop the others.
        console.error(`${src.key} failed:`, err);
        report.push({ source: src.key, error: String(err) });
      }
    }
    return Response.json({ ok: true, dry_run: dryRun, translated: !!GEMINI_API_KEY, report });
  } catch (err) {
    console.error("ingest failed:", err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
});
