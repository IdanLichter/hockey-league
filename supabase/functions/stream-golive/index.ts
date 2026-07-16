// ============================================================================
// stream-golive -- mint a Cloudflare Stream live input for a game and hand the
// browser WHIP ingest URL (+ ICE servers) to an authorized streamer.
//
// User-facing (called from the browser), so it: handles CORS preflight, verifies
// the caller's Supabase JWT, and enforces can_stream_game() (content-editor +
// admin) BEFORE creating a billable live input. Creates the input with automatic
// recording (live becomes the VOD), inserts the public game_videos row (uid in
// video_id), and returns the WHIP url + ICE servers for publishing.
//
// Secrets (Supabase -> Edge Functions -> Secrets):
//   CF_ACCOUNT_ID / CF_STREAM_TOKEN   -- Cloudflare Stream (required)
//   CF_TURN_KEY_ID / CF_TURN_API_TOKEN -- Cloudflare Realtime TURN (optional)
// SUPABASE_URL / SUPABASE_ANON_KEY are auto-injected.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const CF_ACCOUNT_ID = Deno.env.get("CF_ACCOUNT_ID")!;
const CF_TOKEN = Deno.env.get("CF_STREAM_TOKEN")!;

// TURN relay (Cloudflare Realtime) -- OPTIONAL. Publishing over WebRTC from a
// strict/mobile NAT needs a relay; STUN alone can't traverse it. When these are
// set we mint short-lived TURN credentials for the browser; without them the
// stream still works on permissive networks (STUN only). Optional like the FCM
// branch in send-push.
const CF_TURN_KEY_ID = Deno.env.get("CF_TURN_KEY_ID") ?? "";
const CF_TURN_API_TOKEN = Deno.env.get("CF_TURN_API_TOKEN") ?? "";

const CF_API = "https://api.cloudflare.com/client/v4";

// Cloudflare STUN always; short-lived Cloudflare TURN when configured. The TURN
// set includes turns:5349 (TURN-over-TLS/443) so it works even where UDP is
// blocked. Best-effort: a mint failure degrades to STUN-only, never blocks going
// live.
async function buildIceServers(): Promise<unknown[]> {
  const ice: unknown[] = [{ urls: "stun:stun.cloudflare.com:3478" }];
  if (CF_TURN_KEY_ID && CF_TURN_API_TOKEN) {
    try {
      const r = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${CF_TURN_KEY_ID}/credentials/generate`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${CF_TURN_API_TOKEN}`, "content-type": "application/json" },
          body: JSON.stringify({ ttl: 86400 }),
        },
      );
      const j = await r.json();
      if (j?.iceServers) ice.push(j.iceServers);
      else console.log("turn generate: no iceServers", r.status, JSON.stringify(j));
    } catch (e) {
      console.log("turn generate threw", String(e));
    }
  }
  return ice;
}

// The function self-authorizes on the JWT, so "*" is safe (Bearer-token API, not
// cookie-based). supabase-js functions.invoke() adds x-client-info (+ apikey /
// x-supabase-api-version); the browser preflight rejects any header not listed.
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

  // User-scoped client: getUser() and the RPC both run AS the caller, so the gate
  // is byte-for-byte the RLS policy (auth.uid() resolves from this JWT).
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

  // ---- Cloudflare: create the live input (auto-record so live becomes the VOD).
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

  // The account's playback host is customer-<CODE>.cloudflarestream.com -- parse
  // <CODE> from the playback URL so spectators render from the row with no extra
  // config. e.g. https://customer-abc123.cloudflarestream.com/<uid>/webRTC/play
  let cfCode: string | null = null;
  try {
    cfCode = new URL(whepUrl).hostname.split(".")[0].replace(/^customer-/, "") || null;
  } catch { /* leave null -> frontend falls back to the generic host */ }

  // ---- Insert the public row so every spectator sees the embed immediately.
  // Inserted AS the user -> the can_stream_game RLS write policy is the final gate
  // and created_by is the streamer. If it fails, roll back the CF input so we
  // don't leak a billable orphan.
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
    console.log("game_videos insert failed -> deleting CF input", insErr.message);
    await fetch(`${CF_API}/accounts/${CF_ACCOUNT_ID}/stream/live_inputs/${uid}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${CF_TOKEN}` },
    }).catch(() => {});
    return json({ error: "insert failed" }, 500);
  }

  // whipUrl    -> the browser publishes its camera here (WHIP).
  // iceServers -> STUN + (when configured) TURN relay for strict-NAT traversal.
  // uid        -> spectators build the Stream player from this (stored in the row).
  return json({
    uid,
    whipUrl,
    whepUrl,
    cfCustomerCode: cfCode,
    videoRowId: row.id,
    iceServers: await buildIceServers(),
  });
});
