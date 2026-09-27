// game-form — the server half of "enter a result from the handwritten referee form".
//
// A referee / league manager uploads a photo of the טופס שיפוט (web: src/pages/GameResultEntry.jsx).
// A Claude cloud routine (scripts/game-form/ROUTINE.md) then:
//   1. POST {action:"pending"}               → submissions waiting to be read
//   2. POST {action:"get", id}               → the game, both rosters, signed photo URLs
//   3. reads the photo itself
//   4. POST {action:"result", id, extracted} → stores the reading (a PREFILL only)
//      or {action:"fail", id, error}
// Nothing here writes games/game_stats: a human reviews the prefill and approves it through
// apply_game_form_result (supabase/game-form-results.sql).
//
// Why a function and not the service-role key in the routine: same reason as weekly-preview —
// the routine runs in a cloud environment we don't control. This token can only read game
// forms + rosters (names/numbers, no birth dates) and write a submission's prefill.
//
// Auth: `Authorization: Bearer <GAME_FORM_TOKEN>` (function secret). verify_jwt is OFF because
// the caller has no Supabase JWT; the token check below is the whole gate.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN = Deno.env.get("GAME_FORM_TOKEN") ?? "";

const admin = createClient(SB_URL, SB_SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BUCKET = "game-forms";
const STALE_MS = 15 * 60 * 1000; // an "analyzing" row older than this is up for grabs again
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function timingSafeEqual(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function roster(teamId: string) {
  const [{ data: primary }, { data: links }] = await Promise.all([
    admin.from("players").select("id,first_name,last_name,jersey_number,position").eq("team_id", teamId),
    admin.from("player_teams").select("player_id").eq("team_id", teamId),
  ]);
  const ids = new Set((primary ?? []).map((p) => p.id));
  const extra = (links ?? []).map((l) => l.player_id).filter((id) => !ids.has(id));
  let secondary: typeof primary = [];
  if (extra.length) {
    const { data } = await admin.from("players").select("id,first_name,last_name,jersey_number,position").in("id", extra);
    secondary = data ?? [];
  }
  return [...(primary ?? []), ...(secondary ?? [])].map((p) => ({
    player_id: p.id,
    name: `${(p.first_name ?? "").trim()} ${(p.last_name ?? "").trim()}`.replace(/\s+/g, " ").trim(),
    number: p.jersey_number,
    goalkeeper: p.position === "Goalkeeper",
  }));
}

// ---- the prefill shape the routine must send --------------------------------
// {
//   home_score, away_score: int|null        final score as written on the form
//   halftime_home, halftime_away: int|null
//   home_own_goals, away_own_goals: int     usually 0 (the form rarely marks own goals)
//   teams_match: bool                        the team names on the form are this game's teams
//   home_players / away_players: [{
//     player_id: uuid|null                   matched from the roster given by "get", or null
//     written_name: string, number: int|null,
//     goals, blue_cards, red_cards: int, goalkeeper: bool,
//     confidence: "high"|"low", note?: string
//   }]
//   referees: string[], notes: string, warnings: string[]
// }
function int(v: unknown, lo = 0, hi = 50) {
  const n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
}
function str(v: unknown, max = 200) {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function cleanExtraction(x: any, rosterIds: { home: Set<string>; away: Set<string> }) {
  if (!x || typeof x !== "object") throw new Error("extracted must be an object");
  const side = (rows: unknown, ids: Set<string>) =>
    (Array.isArray(rows) ? rows : []).slice(0, 40).map((r: any) => {
      const pid = typeof r?.player_id === "string" && UUID.test(r.player_id) && ids.has(r.player_id) ? r.player_id : null;
      return {
        player_id: pid,
        written_name: str(r?.written_name, 80),
        number: int(r?.number, 0, 999),
        goals: int(r?.goals, 0, 30) ?? 0,
        blue_cards: int(r?.blue_cards, 0, 3) ?? 0,
        red_cards: int(r?.red_cards, 0, 1) ?? 0,
        goalkeeper: r?.goalkeeper === true,
        confidence: r?.confidence === "high" ? "high" : "low",
        note: str(r?.note, 200),
      };
    });
  return {
    home_score: int(x.home_score),
    away_score: int(x.away_score),
    halftime_home: int(x.halftime_home),
    halftime_away: int(x.halftime_away),
    home_own_goals: int(x.home_own_goals) ?? 0,
    away_own_goals: int(x.away_own_goals) ?? 0,
    teams_match: x.teams_match !== false,
    home_players: side(x.home_players, rosterIds.home),
    away_players: side(x.away_players, rosterIds.away),
    referees: (Array.isArray(x.referees) ? x.referees : []).slice(0, 4).map((r: unknown) => str(r, 80)),
    notes: str(x.notes, 1000),
    warnings: (Array.isArray(x.warnings) ? x.warnings : []).slice(0, 20).map((w: unknown) => str(w, 300)),
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!TOKEN || !timingSafeEqual(bearer, TOKEN)) return json(401, { error: "bad token" });

  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: "invalid json" }); }
  const action = body?.action;

  if (action === "pending") {
    const { data, error } = await admin.from("game_form_submissions")
      .select("id,game_id,status,created_at")
      .in("status", ["uploaded", "analyzing"])
      .order("created_at", { ascending: true })
      .limit(10);
    if (error) return json(500, { error: error.message });
    const now = Date.now();
    // "analyzing" rows whose run died are picked up again after STALE_MS.
    const rows = (data ?? []).filter((r) => r.status === "uploaded" || now - new Date(r.created_at).getTime() > STALE_MS);
    return json(200, { pending: rows.map((r) => r.id) });
  }

  const id = String(body?.id ?? "");
  if (!UUID.test(id)) return json(400, { error: "id required" });
  const { data: sub, error: subErr } = await admin.from("game_form_submissions")
    .select("id,game_id,status,photo_paths").eq("id", id).maybeSingle();
  if (subErr) return json(500, { error: subErr.message });
  if (!sub) return json(404, { error: "no such submission" });
  if (!["uploaded", "analyzing"].includes(sub.status)) return json(409, { error: `submission is ${sub.status}` });

  const { data: game, error: gErr } = await admin.from("games")
    .select("id,game_date,venue,game_type,status,home_team_id,away_team_id").eq("id", sub.game_id).single();
  if (gErr) return json(500, { error: gErr.message });

  if (action === "get") {
    const [{ data: teams }, home, away, signed] = await Promise.all([
      admin.from("teams").select("id,name").in("id", [game.home_team_id, game.away_team_id]),
      roster(game.home_team_id),
      roster(game.away_team_id),
      admin.storage.from(BUCKET).createSignedUrls(sub.photo_paths, 600),
    ]);
    if (signed.error) return json(500, { error: signed.error.message });
    await admin.from("game_form_submissions").update({ status: "analyzing" }).eq("id", id);
    const name = (tid: string) => teams?.find((t) => t.id === tid)?.name ?? "";
    return json(200, {
      submission_id: id,
      game: {
        id: game.id,
        date: game.game_date,
        venue: game.venue,
        game_type: game.game_type,
        home_team: name(game.home_team_id),
        away_team: name(game.away_team_id),
      },
      home_roster: home,
      away_roster: away,
      photos: (signed.data ?? []).map((s) => s.signedUrl).filter(Boolean),
    });
  }

  if (action === "result") {
    const [home, away] = await Promise.all([roster(game.home_team_id), roster(game.away_team_id)]);
    let extracted;
    try {
      extracted = cleanExtraction(body.extracted, {
        home: new Set(home.map((p) => p.player_id)),
        away: new Set(away.map((p) => p.player_id)),
      });
    } catch (e) {
      return json(400, { error: (e as Error).message });
    }
    const { error } = await admin.from("game_form_submissions")
      .update({ status: "analyzed", extracted, extract_error: null, analyzed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true, extracted });
  }

  if (action === "fail") {
    const { error } = await admin.from("game_form_submissions")
      .update({ status: "failed", extract_error: str(body?.error, 500) || "unreadable", analyzed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true });
  }

  return json(400, { error: "unknown action" });
});
