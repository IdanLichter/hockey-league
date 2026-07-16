// ============================================================================
// turn-creds -- hand a viewer short-lived Cloudflare TURN ICE servers for WHEP
// playback. Anon-callable (spectators aren't signed in): Cloudflare live streams
// published from the browser (WHIP) have WebRTC-only playback, and viewers on
// strict/mobile networks need a TURN relay to receive it. Credentials are
// ephemeral (2h TTL) and relay-only, so exposing this to anon is low-risk; it
// only spends the account's TURN allowance (1000GB/mo free).
//
// Secrets: CF_TURN_KEY_ID / CF_TURN_API_TOKEN (same as stream-golive).
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const TURN_ID = Deno.env.get("CF_TURN_KEY_ID") ?? "";
const TURN_TOKEN = Deno.env.get("CF_TURN_API_TOKEN") ?? "";

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "access-control-allow-methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const ice: unknown[] = [{ urls: "stun:stun.cloudflare.com:3478" }];
  if (TURN_ID && TURN_TOKEN) {
    try {
      const r = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${TURN_ID}/credentials/generate`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${TURN_TOKEN}`, "content-type": "application/json" },
          body: JSON.stringify({ ttl: 7200 }),
        },
      );
      const j = await r.json();
      if (j?.iceServers) ice.push(j.iceServers);
      else console.log("turn-creds: no iceServers", r.status, JSON.stringify(j));
    } catch (e) {
      console.log("turn-creds threw", String(e));
    }
  }
  return new Response(JSON.stringify({ iceServers: ice }), {
    headers: { ...CORS, "content-type": "application/json" },
  });
});
