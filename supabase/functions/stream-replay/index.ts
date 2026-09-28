// ============================================================================
// stream-replay -- turn a finished app (RTMP) broadcast into its recording.
//
// An RTMP broadcast's game_videos row points at the Cloudflare LIVE INPUT, which plays
// the broadcast while it's on air and "Stream has not started" once it ends. Cloudflare
// keeps the recording as a separate video; this swaps the row over to it so the game
// page shows the replay.
//
// Anon-callable on purpose: the streamer's app calls it after stopping, and any viewer's
// page calls it when it finds a row still pointing at an idle input — so the swap
// happens even if the app died mid-game. It trusts nothing from the caller but a row id:
// the row is read server-side, only RTMP rows still on their live input are touched, and
// the recording is looked up from Cloudflare with our own token. Idempotent.
//
// POST { videoRowId } -> { state: "live" | "processing" | "ready" | "none" | "skip", videoId? }
//
// Secrets: CF_ACCOUNT_ID / CF_STREAM_TOKEN. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// are auto-injected.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CF_ACCOUNT_ID = Deno.env.get("CF_ACCOUNT_ID")!;
const CF_TOKEN = Deno.env.get("CF_STREAM_TOKEN")!;
const CF_API = "https://api.cloudflare.com/client/v4";

const admin = createClient(SB_URL, SB_SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let rowId = "";
  try {
    const b = await req.json();
    rowId = String(b?.videoRowId ?? "");
  } catch { /* 400 below */ }
  if (!UUID.test(rowId)) return json({ error: "missing videoRowId" }, 400);

  const { data: row, error } = await admin
    .from("game_videos")
    .select("id, video_id, ingest, cf_live_input")
    .eq("id", rowId)
    .maybeSingle();
  if (error) return json({ error: "lookup failed" }, 500);
  if (!row) return json({ state: "none" });
  // Only RTMP rows still sitting on their live input need (or may get) a swap.
  if (row.ingest !== "rtmp" || !row.cf_live_input || row.video_id !== row.cf_live_input) {
    return json({ state: "skip", videoId: row.video_id });
  }

  const r = await fetch(
    `${CF_API}/accounts/${CF_ACCOUNT_ID}/stream/live_inputs/${row.cf_live_input}/videos`,
    { headers: { authorization: `Bearer ${CF_TOKEN}` } },
  );
  const cf = await r.json().catch(() => null);
  if (!cf?.success) {
    console.log("cloudflare list videos failed", r.status, JSON.stringify(cf));
    return json({ error: "cloudflare error" }, 502);
  }
  const videos: any[] = cf.result ?? [];
  if (videos.some((v) => v?.status?.state === "live-inprogress")) return json({ state: "live" });

  // One recording per broadcast. A reconnect inside the input's timeout continues the
  // same recording; a longer outage starts a new one — keep the longest as the replay.
  const recs = videos.filter((v) => v?.uid && v?.status?.state !== "error");
  if (!recs.length) return json({ state: "none" });
  const ready = recs.filter((v) => v.readyToStream);
  if (!ready.length) return json({ state: "processing" });
  const best = ready.sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))[0];

  const { error: upErr } = await admin
    .from("game_videos")
    .update({ video_id: best.uid, kind: "full" })
    .eq("id", row.id)
    .eq("video_id", row.cf_live_input); // no-op if another caller already swapped it
  if (upErr) {
    console.log("game_videos swap failed", upErr.message);
    return json({ error: "update failed" }, 500);
  }
  return json({ state: "ready", videoId: best.uid, pieces: ready.length });
});
