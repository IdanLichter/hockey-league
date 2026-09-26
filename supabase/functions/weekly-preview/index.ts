// weekly-preview — the server half of the Friday match-day preview.
//
// A Claude cloud routine (scripts/weekly-preview/ROUTINE.md) runs every Friday:
//   1. POST {action:"facts"}    → this Saturday's games + the numbers worth writing about
//   2. renders a poster PNG itself (headless Chrome, real crests, real Hebrew)
//   3. writes the Hebrew text itself
//   4. POST {action:"publish"}  → uploads the PNG and inserts the feed post
//
// Why a function and not the service-role key in the routine: the routine lives in a
// cloud environment we don't control. This token can do exactly one thing — post (or
// re-post) the preview for an upcoming Saturday that really has league games — so a
// leaked token can't read private data or write anything else.
//
// Auth: `Authorization: Bearer <WEEKLY_PREVIEW_TOKEN>` (function secret). verify_jwt is
// off for this function because the caller has no Supabase JWT; the token check below
// is the whole gate.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN = Deno.env.get("WEEKLY_PREVIEW_TOKEN") ?? "";

const admin = createClient(SB_URL, SB_SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SITE = "https://rinkhockeyil.com";
const BUCKET = "poster-backgrounds";          // public; previews live under weekly-preview/
const SOURCE_NAME = "תצוגה מקדימה · מחזור השבת"; // the card's chip — also what makes web/native show the image
const TZ = "Asia/Jerusalem";

// ---- dates -----------------------------------------------------------------
// Everything the league does is Israel-local; the function runs in UTC.
function localParts(d: Date) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === "24" ? "00" : p.hour}:${p.minute}`, weekday: p.weekday };
}

const HE_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
function hebrewDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return { day: HE_DAYS[dow], short: `${d}.${m}`, full: `${d}.${m}.${y}` };
}

// ---- facts -----------------------------------------------------------------
type Team = { id: string; name: string; slug: string | null; logo_url: string | null; primary_color: string | null; secondary_color: string | null; home_venue: string | null };

async function gamesOn(ymd: string) {
  // A ±36h UTC window, then filter by local date — avoids DST arithmetic.
  const lo = new Date(`${ymd}T00:00:00Z`).getTime() - 36e5 * 12;
  const hi = lo + 36e5 * 60;
  const { data, error } = await admin.from("games")
    .select("id,slug,game_date,venue,game_type,status,playoff_round,series_game,home_team_id,away_team_id,season_id")
    .gte("game_date", new Date(lo).toISOString()).lt("game_date", new Date(hi).toISOString())
    .neq("game_type", "ידידותי").order("game_date");
  if (error) throw error;
  return (data ?? []).filter((g) => localParts(new Date(g.game_date)).date === ymd);
}

async function buildFacts(ymd: string) {
  const games = (await gamesOn(ymd)).filter((g) => g.status === "scheduled");
  if (!games.length) return { saturday: ymd, date: hebrewDate(ymd), games: [] };

  const teamIds = [...new Set(games.flatMap((g) => [g.home_team_id, g.away_team_id]))];
  const { data: teams, error: tErr } = await admin.from("teams")
    .select("id,name,slug,logo_url,primary_color,secondary_color,home_venue");
  if (tErr) throw tErr;
  const byId = new Map((teams as Team[]).map((t) => [t.id, t])); // all teams: opponents' names too

  const { data: seasons } = await admin.from("seasons").select("id,name,status,starts_on").order("starts_on", { ascending: false, nullsFirst: false });
  const current = seasons?.find((s) => s.status === "active") ?? null;
  const previous = seasons?.filter((s) => s.id !== current?.id).find((s) => s.status === "archived") ?? null;

  // Completed games between/around these teams, newest first.
  const { data: done } = await admin.from("games")
    .select("id,game_date,home_team_id,away_team_id,home_score,away_score,game_type,season_id,is_technical_loss")
    .eq("status", "completed").neq("game_type", "ידידותי")
    .or(`home_team_id.in.(${teamIds.join(",")}),away_team_id.in.(${teamIds.join(",")})`)
    .order("game_date", { ascending: false }).limit(400);
  const completed = done ?? [];

  const resultFor = (g: any, teamId: string) => {
    const home = g.home_team_id === teamId;
    const us = home ? g.home_score : g.away_score, them = home ? g.away_score : g.home_score;
    const opp = byId.get(home ? g.away_team_id : g.home_team_id)?.name ?? null;
    return { date: localParts(new Date(g.game_date)).date, opponent: opp, score_for: us, score_against: them,
      result: us > them ? "W" : us < them ? "L" : "D", home, game_type: g.game_type };
  };

  // Current-season table (league games only) computed from completed games of the season.
  let table: any[] = [];
  if (current) {
    const { data: seasonGames } = await admin.from("games")
      .select("home_team_id,away_team_id,home_score,away_score").eq("season_id", current.id)
      .eq("status", "completed").eq("game_type", "ליגה");
    const acc = new Map<string, any>();
    const row = (id: string) => acc.get(id) ?? acc.set(id, { team_id: id, played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }).get(id);
    for (const g of seasonGames ?? []) {
      const h = row(g.home_team_id), a = row(g.away_team_id);
      h.played++; a.played++; h.gf += g.home_score; h.ga += g.away_score; a.gf += g.away_score; a.ga += g.home_score;
      if (g.home_score > g.away_score) { h.w++; a.l++; h.pts += 3; } else if (g.home_score < g.away_score) { a.w++; h.l++; a.pts += 3; } else { h.d++; a.d++; h.pts++; a.pts++; }
    }
    table = [...acc.values()].sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf)
      .map((r, i) => ({ rank: i + 1, ...r }));
  }

  // Last season's final standing + top scorer per team.
  let prevStand = new Map<string, any>(), prevScorers = new Map<string, any[]>();
  if (previous) {
    const { data: ts } = await admin.from("team_season_stats")
      .select("team_id,final_rank,points,wins,ties,losses,goals_for,goals_against").eq("season_id", previous.id);
    prevStand = new Map((ts ?? []).map((r) => [r.team_id, r]));
    const { data: ps } = await admin.from("player_season_stats")
      .select("team_id,player_id,first_name,last_name,goals,games_played").eq("season_id", previous.id)
      .in("team_id", teamIds).gt("goals", 0).order("goals", { ascending: false });
    for (const p of ps ?? []) {
      const list = prevScorers.get(p.team_id) ?? [];
      if (list.length < 2) list.push({ name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(), goals: p.goals, games: p.games_played });
      prevScorers.set(p.team_id, list);
    }
  }

  // ---- Player imagery (approved background-removed cutouts; see supabase/player-cutouts.sql).
  // Deterministic per Saturday: re-running the same week picks the same images, the next
  // week rotates to different ones.
  const { data: roster } = await admin.from("players").select("id,first_name,last_name,team_id").in("team_id", teamIds);
  const playerById = new Map((roster ?? []).map((p) => [p.id, p]));
  const { data: cuts } = await admin.from("player_cutouts").select("player_ids,image_url").eq("status", "approved")
    .overlaps("player_ids", [...playerById.keys()]);
  const weekSeed = Math.floor(Date.parse(ymd) / (7 * 864e5));
  const hash = (str: string) => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, weekSeed);
  const pick = <T,>(arr: T[], salt: string) => arr.length ? arr[hash(salt) % arr.length] : null;
  const who = (id: string) => { const p = playerById.get(id); return p ? { name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(), team: byId.get(p.team_id)?.name ?? null } : null; };
  const teamOf = (id: string) => playerById.get(id)?.team_id ?? null;
  const allScorers = new Map<string, number>();   // player_id -> last-season goals (for preference)
  if (previous) {
    const { data: g } = await admin.from("player_season_stats").select("player_id,goals").eq("season_id", previous.id).in("team_id", teamIds);
    for (const r of g ?? []) if (r.player_id) allScorers.set(r.player_id, r.goals ?? 0);
  }

  /** One solo cutout for a team: among the team's (up to) 3 top-scoring players that HAVE
   *  a cutout, rotate by week; then rotate between that player's cutouts. */
  const featureFor = (teamId: string) => {
    const solos = (cuts ?? []).filter((c) => c.player_ids.length === 1 && teamOf(c.player_ids[0]) === teamId);
    const players = [...new Set(solos.map((c) => c.player_ids[0]))]
      .sort((a, b) => (allScorers.get(b) ?? 0) - (allScorers.get(a) ?? 0)).slice(0, 3);
    const pid = pick(players, teamId);
    if (pid) {
      const c = pick(solos.filter((x) => x.player_ids[0] === pid), pid)!;
      return { kind: "solo", image_url: c.image_url, players: [who(pid)] };
    }
    // no solo: a same-team pair still shows the team
    const pair = pick((cuts ?? []).filter((c) => c.player_ids.length === 2 && c.player_ids.every((x) => teamOf(x) === teamId)), teamId + "duo");
    return pair ? { kind: "duo", image_url: pair.image_url, players: pair.player_ids.map(who) } : null;
  };

  /** A pair with one player from each side of THIS fixture — the matchup's hero image. */
  const matchupFor = (homeId: string, awayId: string) => {
    const pairs = (cuts ?? []).filter((c) => c.player_ids.length === 2 &&
      new Set(c.player_ids.map(teamOf)).has(homeId) && new Set(c.player_ids.map(teamOf)).has(awayId));
    const c = pick(pairs, homeId + awayId);
    return c ? { kind: "duo", image_url: c.image_url, players: c.player_ids.map(who) } : null;
  };

  const teamFacts = (id: string) => {
    const t = byId.get(id)!;
    const last = completed.filter((g) => g.home_team_id === id || g.away_team_id === id).slice(0, 3).map((g) => resultFor(g, id));
    return {
      name: t.name, url: t.slug ? `${SITE}/teams/${t.slug}` : null,
      logo_url: t.logo_url, primary_color: t.primary_color, secondary_color: t.secondary_color,
      this_season: table.find((r) => r.team_id === id) ?? null,
      last_season: prevStand.get(id) ? { season: previous!.name, ...prevStand.get(id), top_scorers: prevScorers.get(id) ?? [] } : null,
      last_results: last,
      featured_player_image: featureFor(id),
    };
  };

  const out = games.map((g) => {
    const h2h = completed.filter((x) =>
      (x.home_team_id === g.home_team_id && x.away_team_id === g.away_team_id) ||
      (x.home_team_id === g.away_team_id && x.away_team_id === g.home_team_id)).slice(0, 4)
      .map((x) => resultFor(x, g.home_team_id));
    return {
      id: g.id, url: g.slug ? `${SITE}/games/${g.slug}` : `${SITE}/games`,
      kickoff: localParts(new Date(g.game_date)).time, venue: g.venue, game_type: g.game_type,
      playoff_round: g.playoff_round, series_game: g.series_game,
      home: teamFacts(g.home_team_id), away: teamFacts(g.away_team_id),
      head_to_head_from_home_view: h2h,
      // Set when we have a photo of a home player and an away player together. The poster
      // then shows that one image for the game instead of one cutout per team.
      matchup_image: matchupFor(g.home_team_id, g.away_team_id),
    };
  });

  const played = table.reduce((n, r) => n + r.played, 0) / 2;
  return {
    saturday: ymd, date: hebrewDate(ymd),
    season: current?.name ?? null, league_games_played_this_season: played,
    is_opening_round: played === 0,
    league_table: table.map((r) => ({ ...r, team: byId.get(r.team_id)?.name ?? r.team_id })),
    games: out,
    note: "Scores are real. Only state facts present here; if a list is empty, say nothing about it.",
  };
}

// ---- publish ---------------------------------------------------------------
async function botAuthor(): Promise<string> {
  // The news-ingest bot. Its rate-limit exemption (profiles.is_bot) is what lets it post.
  const { data, error } = await admin.from("profiles").select("id").eq("is_bot", true)
    .order("created_at").limit(1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("no bot profile — run ingest-rink-hockey-news once to provision it");
  return data.id;
}

function b64ToBytes(b64: string) {
  const bin = atob(b64.replace(/^data:image\/\w+;base64,/, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function publish(body: any) {
  const ymd = String(body?.saturday ?? "");
  const text = String(body?.text ?? "").trim();
  const png = String(body?.image_base64 ?? "");
  const dryRun = !!body?.dry_run;

  // Only an upcoming Saturday (within 8 days) that really has scheduled league games.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return { ok: false, error: "bad saturday" };
  const today = localParts(new Date()).date;
  const days = (Date.parse(ymd) - Date.parse(today)) / 864e5;
  // A dry run writes nothing, so it may validate a later Saturday (testing ahead of the season).
  // A real post goes out only on the eve of the games: the Saturday must be TOMORROW (Israel
  // time). A late, early or wrong-day run can therefore never announce the wrong weekend.
  // A dry run writes no post, so it may preview any Saturday.
  if (!dryRun && days !== 1) return { ok: false, error: `not the day before ${ymd} (today is ${today}) — nothing posted` };
  const games = (await gamesOn(ymd)).filter((g) => g.status === "scheduled");
  if (!games.length) return { ok: false, error: "no scheduled games that day" };

  // Feed cards (web + both apps) show only the first paragraph of a sourced post.
  if (text.includes("\n\n")) return { ok: false, error: "text must not contain a blank line (cards cut at the first one)" };
  if (text.length < 40 || text.length > 1200) return { ok: false, error: `text length ${text.length} outside 40..1200` };
  const bytes = b64ToBytes(png);
  if (bytes.length < 10_000 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return { ok: false, error: "image_base64 is not a PNG" };
  if (bytes.length > 5_000_000) return { ok: false, error: "image too large" };

  const guid = `weekly-preview:${ymd}`;
  const { data: existing } = await admin.from("posts").select("id,deleted_at").eq("external_guid", guid).maybeSingle();
  if (existing?.deleted_at) return { ok: false, error: "a moderator deleted this week's preview — not re-posting", post_id: existing.id };
  // Every run uploads its poster (unique name → no stale CDN copy on a re-run), so even a dry
  // run ends with a link a human can open. Dry runs go under dry-run/ and touch no post.
  const path = `weekly-preview/${dryRun ? "dry-run/" : ""}${ymd}-${Date.now()}.png`;
  const up = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: "image/png", upsert: false });
  if (up.error) throw up.error;
  const image_url = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  if (dryRun) return { ok: true, dry_run: true, would: existing ? "update" : "insert", guid, games: games.length, image_url, text };

  const row = { body: text, image_url, source_name: SOURCE_NAME, link_url: `${SITE}/games` };
  if (existing) {
    const { error } = await admin.from("posts").update({ ...row, updated_at: new Date().toISOString() }).eq("id", existing.id);
    if (error) throw error;
    return { ok: true, action: "updated", post_id: existing.id, image_url, text, feed_url: `${SITE}/` };
  }
  const { data: ins, error } = await admin.from("posts")
    .insert({ ...row, author_id: await botAuthor(), external_guid: guid }).select("id").single();
  if (error) throw error;
  return { ok: true, action: "inserted", post_id: ins.id, image_url, text, feed_url: `${SITE}/` };
}

// ---- entry -----------------------------------------------------------------
Deno.serve(async (req) => {
  try {
    const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!TOKEN || bearer !== TOKEN) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    if (body?.action === "facts") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(body?.saturday ?? "")) {
        return Response.json({ ok: true, facts: await buildFacts(body.saturday) });
      }
      // Default (the Friday routine): only TOMORROW, and only if tomorrow is a Saturday.
      const tomorrow = localParts(new Date(Date.now() + 864e5));
      if (tomorrow.weekday !== "Sat") {
        return Response.json({ ok: true, facts: { saturday: null, games: [], note: `tomorrow (${tomorrow.date}) is not a Saturday — no preview` } });
      }
      const ymd = tomorrow.date;
      return Response.json({ ok: true, facts: await buildFacts(ymd) });
    }
    if (body?.action === "publish") {
      const r = await publish(body);
      return Response.json(r, { status: r.ok ? 200 : 400 });
    }
    return Response.json({ ok: false, error: "action must be facts|publish" }, { status: 400 });
  } catch (e) {
    console.error("weekly-preview failed", e);
    return Response.json({ ok: false, error: String((e as any)?.message ?? e) }, { status: 500 });
  }
});
