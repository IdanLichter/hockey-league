// ============================================================================
// send-push — fan a single `notifications` row out to the recipient's devices.
//
// Called by an AFTER INSERT trigger on public.notifications (via pg_net), NOT
// by end users. Auth is a shared secret in the `x-push-secret` header, compared
// to the PUSH_WEBHOOK_SECRET env var — so verify_jwt is disabled for this fn.
//
// Two delivery channels, both best-effort:
//   • web  → Web Push protocol (VAPID)           — npm:web-push
//   • ios  → Apple Push Notification service      — hand-rolled JWT + HTTP/2 fetch
//
// Dead subscriptions (410 Gone / BadDeviceToken / Unregistered) are pruned.
// The Hebrew copy mirrors src/lib/notifications.js so a push reads exactly like
// the in-app bell.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!; // auto-injected
const WEBHOOK_SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET")!;

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@rinkhockeyil.com";

const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID")!;
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID")!;
const APNS_BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID")!;
const APNS_PRIVATE_KEY = Deno.env.get("APNS_PRIVATE_KEY")!; // .p8 contents (PKCS8 PEM)

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const admin = createClient(SB_URL, SB_SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---- Hebrew copy (ported from src/lib/notifications.js) --------------------
const ROLE_LABEL: Record<string, string> = {
  player: "שחקן", coach: "מאמן", content_editor: "עורך תוכן", judge: "שופט",
};

function bodyPreview(n: NotificationRow): string {
  return (n.data?.preview ?? "").toString();
}

function notificationText(n: NotificationRow, actorName: string): string {
  const d = n.data ?? {};
  switch (n.type) {
    case "post_like":      return `${actorName} אהב/ה את הפוסט שלך`;
    case "post_comment":   return `${actorName} הגיב/ה על הפוסט שלך`;
    case "claim_approved": return `הבקשה שלך להתחבר לשחקן ${d.player_name ?? ""} אושרה 🎉`;
    case "claim_rejected": return `הבקשה שלך להתחבר לשחקן ${d.player_name ?? ""} נדחתה`;
    case "role_granted":   return `קיבלת תפקיד: ${ROLE_LABEL[d.role] ?? d.role ?? ""}`;
    case "claim_request":  return `${d.claimant ?? "משתמש"} מבקש/ת להתחבר לשחקן ${d.player_name ?? ""}`;
    case "content_report": return `דווח תוכן${d.reason ? ` — ${d.reason}` : ""}`;
    case "game_result":    return `תוצאה: ${d.home_team ?? ""} ${d.home_score ?? ""}:${d.away_score ?? ""} ${d.away_team ?? ""}`;
    default:               return "התראה חדשה";
  }
}

function notificationHref(n: NotificationRow): string {
  switch (n.type) {
    case "claim_approved":
    case "claim_rejected": return n.entity_id ? `/players/${n.entity_id}` : "/me";
    case "role_granted":   return "/me";
    case "claim_request":
    case "content_report": return "/admin";
    case "game_result":    return n.entity_id ? `/games/${n.entity_id}` : "/games";
    default:               return "/";
  }
}

// ---- APNs auth token (ES256 JWT, cached ~50 min) ---------------------------
function b64urlFromBytes(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlFromString(str: string): string {
  return b64urlFromBytes(new TextEncoder().encode(str));
}
function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const raw = atob(body);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

let apnsKeyPromise: Promise<CryptoKey> | null = null;
function apnsSigningKey(): Promise<CryptoKey> {
  if (!apnsKeyPromise) {
    apnsKeyPromise = crypto.subtle.importKey(
      "pkcs8", pemToPkcs8(APNS_PRIVATE_KEY),
      { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
    );
  }
  return apnsKeyPromise;
}

let cachedToken: { jwt: string; at: number } | null = null;
async function apnsAuthToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now - cachedToken.at < 3000) return cachedToken.jwt; // reuse < 50 min
  const header = b64urlFromString(JSON.stringify({ alg: "ES256", kid: APNS_KEY_ID }));
  const payload = b64urlFromString(JSON.stringify({ iss: APNS_TEAM_ID, iat: now }));
  const signingInput = `${header}.${payload}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, await apnsSigningKey(),
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${b64urlFromBytes(new Uint8Array(sig))}`;
  cachedToken = { jwt, at: now };
  return jwt;
}

async function sendApns(
  deviceToken: string, environment: string | null,
  title: string, body: string, url: string, badge: number,
): Promise<{ ok: boolean; prune: boolean }> {
  const jwt = await apnsAuthToken();
  const aps = {
    aps: { alert: { title, body }, sound: "default", badge, "thread-id": "rinkhockeyil" },
    url,
  };
  const hosts = environment === "sandbox"
    ? ["api.sandbox.push.apple.com"]
    : ["api.push.apple.com", "api.sandbox.push.apple.com"]; // prod first, sandbox fallback
  let prune = false;
  for (const host of hosts) {
    const res = await fetch(`https://${host}/3/device/${deviceToken}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": APNS_BUNDLE_ID,
        "apns-push-type": "alert",
        "apns-priority": "10",
      },
      body: JSON.stringify(aps),
    });
    if (res.ok) return { ok: true, prune: false };
    const reason = await res.text();
    // 400 BadDeviceToken on prod usually means the token is a sandbox token → retry sandbox.
    if (res.status === 400 && reason.includes("BadDeviceToken") && host === "api.push.apple.com") {
      continue;
    }
    // Token is permanently invalid → prune it.
    if (res.status === 410 || reason.includes("Unregistered") || reason.includes("BadDeviceToken")) {
      prune = true;
    }
    console.log(`APNs ${host} -> ${res.status} ${reason}`);
    return { ok: false, prune };
  }
  return { ok: false, prune };
}

// ---- types -----------------------------------------------------------------
interface NotificationRow {
  id: string; user_id: string; type: string; actor_id: string | null;
  entity_type: string | null; entity_id: string | null;
  data: Record<string, any> | null;
}
interface PushSub {
  id: string; platform: "web" | "ios"; endpoint: string;
  keys: { p256dh: string; auth: string } | null; environment: string | null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (req.headers.get("x-push-secret") !== WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  let n: NotificationRow;
  try {
    const payload = await req.json();
    // pg_net sends the trigger body; Supabase DB webhooks would nest under `record`.
    n = payload.record ?? payload.notification ?? payload;
  } catch {
    return new Response("bad request", { status: 400 });
  }
  if (!n?.user_id || !n?.type) return new Response("missing fields", { status: 400 });

  // Resolve the actor's display name (post_like/post_comment read it), matching the bell.
  let actorName = "מישהו";
  if (n.actor_id) {
    const { data: prof } = await admin
      .from("profiles").select("display_name").eq("id", n.actor_id).maybeSingle();
    if (prof?.display_name?.trim()) actorName = prof.display_name.trim();
  }

  const title = notificationText(n, actorName);
  const body = bodyPreview(n);
  const path = notificationHref(n);

  // Recipient's devices.
  const { data: subs, error } = await admin
    .from("push_subscriptions").select("id, platform, endpoint, keys, environment")
    .eq("user_id", n.user_id);
  if (error) {
    console.log("subs query error", error.message);
    return new Response("db error", { status: 500 });
  }
  if (!subs?.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 });

  // Unread badge count for iOS.
  const { count: badge } = await admin
    .from("notifications").select("id", { count: "exact", head: true })
    .eq("user_id", n.user_id).is("read_at", null);

  const toPrune: string[] = [];
  let sent = 0;

  await Promise.all((subs as PushSub[]).map(async (s) => {
    try {
      if (s.platform === "web") {
        if (!s.keys) { toPrune.push(s.id); return; }
        const webPayload = JSON.stringify({ title, body, url: path, tag: n.type });
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: s.keys },
          webPayload,
          { TTL: 60 * 60 * 24 },
        );
        sent++;
      } else if (s.platform === "ios") {
        const r = await sendApns(s.endpoint, s.environment, title, body, path, badge ?? 0);
        if (r.ok) sent++;
        if (r.prune) toPrune.push(s.id);
      }
    } catch (e: any) {
      const code = e?.statusCode ?? e?.status;
      if (code === 404 || code === 410) toPrune.push(s.id); // gone/expired web sub
      console.log(`push ${s.platform} err`, code ?? "", e?.message ?? String(e));
    }
  }));

  if (toPrune.length) {
    await admin.from("push_subscriptions").delete().in("id", toPrune);
  }

  return new Response(JSON.stringify({ sent, pruned: toPrune.length }), {
    status: 200, headers: { "content-type": "application/json" },
  });
});
