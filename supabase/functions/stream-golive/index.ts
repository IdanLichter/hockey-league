// ============================================================================
// stream-golive — mint a Cloudflare Stream live input for a game and hand the
// browser WHIP ingest URL to an authorized streamer.
//
// Called from the browser ("שדר עכשיו"). Unlike send-push (trigger-only,
// shared-secret auth) this is USER-facing, so it:
//   • handles CORS (browser preflight),
//   • verifies the caller's Supabase JWT, and
//   • enforces the SAME gate as the RLS write policy — can_stream_game(game_id)
//     = admin ∪ content-editor ∪ judge ∪ coach-of-a-team — BEFORE spending any
//     Cloudflare money (a live input is billable).
//
// On success it creates a live input with automatic recording (so live→VOD is
// ONE asset, mirroring the YouTube row), inserts the public game_videos row (the
// spectators' realtime subscription then shows the embed instantly), and returns
// the WHIP url the browser publishes its camera to. The live-input uid lands in
// game_videos.video_id, exactly like a YouTube id.
//
// Secrets (set in Supabase → Edge Functions → Secrets):
//   CF_ACCOUNT_ID    — Cloudflare account id (identifier, not secret)
//   CF_STREAM_TOKEN  — Cloudflare API token, scoped Stream → Edit
// SUPABASE_URL / SUPABASE_ANON_KEY are auto-injected.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const CF_ACCOUNT_ID = Deno.env.get("CF_ACCOUNT_ID")!;
const CF_TOKEN = Deno.env.get("CF_STREAM_TOKEN")!;

const CF_API = "https://api.cloudflare.com/client/v4";

// The function self-authorizes on the JWT, so "*" is safe here (it's a
// Bearer-token API, not cookie-based). supabase-js functions.invoke() adds
// x-client-info (+ apikey / x-supabase-api-version); the browser preflight
// rejects ANY header not listed here, so mirror the standard Supabase set.
const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "access-control-allow-methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  let gameId: string | null = null;
  try {
    const b = await req.json();
    gameId = (b?.gameId ?? b?.game_id ?? "").toString() || null;
  } catch { /* fallthrough to 400 */ }
  if (!gameId) return json({ error: "missing gameId" }, 400);

  // User-scoped client: getUser() and the RPC both run AS the caller, so the
  // gate is byte-for-byte the RLS policy (auth.uid() resolves from this JWT).
  const asUser = createClient(SB_URL, SB_ANON, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  const { data: canStream, error: gateErr } = await asUser.rpc("can_stream_game", {
    p_game_id: gameId,
  });
  if (gateErr) {
    console.log("can_stream_game failed", gateErr.message);
    return json({ error: "gate check failed" }, 500);
  }
  if (canStream !== true) return json({ error: "forbidden" }, 403);

  // ---- Cloudflare: create the live input (auto-record → live becomes the VOD).
  let cf: any = null;
  let cfStatus = 0;
  try {
    const cfRes = await fetch(`${CF_API}/accounts/${CF_ACCOUNT_ID}/stream/live_inputs`, {
      method: "POST",
      headers: { authorization: `Bearer ${CF_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({
        meta: { name: `game:${gameId}` },
        recording: { mode: "automatic", requireSignedURLs: false, timeoutSeconds: 10 },
        preferLowLatency: true,
      }),
    });
    cfStatus = cfRes.status;
    cf = await cfRes.json();
  } catch (e) {
    console.log("cloudflare fetch threw", String(e));
  }
  if (!cf?.success || !cf?.result?.uid) {
    console.log("cloudflare create live_input failed", cfStatus, JSON.stringify(cf));
    return json({ error: "cloudflare error" }, 502);
  }

  const uid: string = cf.result.uid;
  const whipUrl: string = cf.result.webRTC?.url ?? "";
  const whepUrl: string = cf.result.webRTCPlayback?.url ?? "";

  // The account's playback host is customer-<CODE>.cloudflarestream.com — parse
  // <CODE> from the playback URL so spectators render from the row with no extra
  // config. e.g. https://customer-abc123.cloudflarestream.com/<uid>/webRTC/play
  let cfCode: string | null = null;
  try {
    cfCode = new URL(whepUrl).hostname.split(".")[0].replace(/^customer-/, "") || null;
  } catch { /* leave null → frontend falls back to the generic host */ }

  // ---- Insert the public row so every spectator sees the embed immediately.
  // Inserted AS the user → the can_stream_game RLS write policy is the final
  // gate and created_by is the streamer. If it fails, roll back the CF input so
  // we don't leak a billable orphan.
  const { data: row, error: insErr } = await asUser
    .from("game_videos")
    .insert({
      game_id: gameId,
      provider: "cloudflare",
      video_id: uid,
      kind: "live",
      is_primary: true,
      cf_customer_code: cfCode,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insErr) {
    console.log("game_videos insert failed → deleting CF input", insErr.message);
    await fetch(`${CF_API}/accounts/${CF_ACCOUNT_ID}/stream/live_inputs/${uid}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${CF_TOKEN}` },
    }).catch(() => {});
    return json({ error: "insert failed" }, 500);
  }

  // whipUrl → the browser publishes its camera here (WHIP).
  // uid       → spectators build the Stream player from this (stored in the row).
  return json({ uid, whipUrl, whepUrl, cfCustomerCode: cfCode, videoRowId: row.id });
});
