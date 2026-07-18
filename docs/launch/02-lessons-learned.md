# Lessons Learned — rinkhockeyil.com launch (2026-07-12)

Hard-won gotchas from executing the launch. These are the things that cost time or nearly broke
something — worth re-reading before touching the same systems again.

---

## Supabase

- **Custom SMTP `smtp_port` must be a STRING.** `PATCH /config/auth` with `"smtp_port": 465`
  returns **400** `"smtp_port: Expected string, received number"`. Send `"465"`.
- **The Google provider folds "additional client IDs" INTO `external_google_client_id`.** The
  Management API stores all allowed Google client IDs as a single **comma-separated**
  `external_google_client_id` string, where the **first is the primary** (used with the stored
  `external_google_secret` for the server-side web flow) and the rest are additional audiences.
  - **PATCHing `external_google_additional_client_ids` WIPES the primary.** We did exactly this,
    which dropped the original `492430847434-…` primary (whose secret is stored) and left a
    client/secret mismatch that *would* have broken web Google login.
  - **Fix / rule:** always PATCH `external_google_client_id` with the real primary **first**, then
    the extra client IDs, comma-separated. Verify with
    `GET /auth/v1/authorize?provider=google` and check the redirect `Location` uses the primary id.
- **Auth mailer template changes propagate on an independent per-template cache cycle.** The SMTP
  sender name updates instantly, but subject/body can lag ~1 min — and different templates refresh
  at different times (our *confirmation* template flipped to Hebrew in ~80 s while *recovery* stayed
  English for several minutes). Re-pushing just the lagging template + waiting cleared it. Always
  wait and re-check the Resend/email log before concluding a template "didn't take".
- **Recovery / OTP emails are per-address rate-limited** (`smtp_max_frequency`, default 60 s). Don't
  hammer `/auth/v1/recover` while testing.
- The **management token can read owner-only endpoints** once the account is org Owner (e.g.
  `/v1/organizations/{slug}/members`) — a quick way to confirm the elevation actually landed.

## Google Cloud Management API is behind Cloudflare — use `curl`, not Python `urllib`

- `PATCH https://api.supabase.com/...` from Python **`urllib`** gets **Cloudflare-WAF-blocked**:
  `403 "error code: 1010"` (banned browser signature). The same request via **`curl`** works.
  Build the JSON in Python if you like (for UTF-8 Hebrew), but **pipe it to `curl --data-binary @-`**.

## Cloudflare / Vercel domain

- **Grey-cloud (DNS-only) is mandatory** for the Vercel `A` records — orange-cloud proxying breaks
  Vercel's SSL issuance.
- Consequently, **`www → apex` redirects must be done in Vercel**, not with a Cloudflare redirect
  rule (those only fire on proxied/orange traffic).
- Use the **exact** A-record target Vercel prints (it told us `76.76.21.21`) — don't reuse an old IP.
- After a fresh record, a machine that already queried the name can hold a **negative DNS cache**;
  it resolves via `dig @1.1.1.1` but the local browser/curl still `couldn't resolve host`. Flush DNS
  (`sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`) or test with
  `curl --resolve host:443:76.76.21.21`.

## Browser automation — the big one: non-fronted tabs render-pause

- Only **one** browser tab is OS-fronted at a time (`tabs_context_mcp.selectedTabId`). **Any tab
  that isn't fronted pauses rendering**: **coordinate clicks silently fail and screenshots go
  stale**, even right after navigating that tab.
- What still works on a paused/background tab: **DOM-level operations** — `read_page`, `find`,
  `form_input`, and especially **`javascript_tool`**.
- **The reliable pattern** (used to add the GSC verification TXT at Cloudflare): drive the paused tab
  entirely via JavaScript — open the modal, set the custom type-dropdown, set the React-controlled
  inputs via the native value setter + dispatch an `input` event, click Save — all in **one JS
  call** — then confirm the result **out-of-band** (e.g. `dig`).
- **JS output is dropped to `{}` when it contains a high-entropy token** (DKIM keys, verification
  tokens look like secrets to the output filter). So don't *return* the secret from JS — use it
  inside the script and return only booleans/lengths, then verify externally.
- To get an exact long value the UI truncates (`…`), read it from the DOM: `read_page`'s
  accessibility tree exposes input `value`/labels that the on-screen text hides.

## Resend

- A **"Sending access"** (restricted) API key **401s on `/domains`** (`restricted_api_key`) but can
  POST `/emails` fine. Least-privilege is good for the SMTP password, but you can't manage domains
  with it — use the dashboard (or a full-access key) for domain setup.
- Resend's **Auto-configure for Cloudflare** writes all DKIM/SPF/MX records for you — far safer than
  transcribing a 200-char DKIM key by hand. (Trade-off: it's a scoped Cloudflare grant.)

## Identity / branding

- The sport is **rink hockey** — Hebrew **הוקי גלגיליות** (quad skates, ball + curved stick).
  The English brand `rinkhockeyIL` / `rinkhockeyil.com` and the app id are **correct**. It is
  **not** roller/inline hockey (**הוקי רולר**) or ice hockey (**הוקי קרח**) — those are different
  sports. ⚠️ An earlier version of this note had it backwards ("the brand is roller hockey, not
  rink"); the whole app was mistakenly branded "ליגת הרולר הוקי" and was corrected to
  "ליגת הוקי הגלגיליות" on 2026-07-18. Do not reintroduce "רולר".
- Package/bundle id is `com.arielbiton.rinkhockeyil` for both iOS and Android.
- The Android app is **sideloaded** (no Play distribution) → no Google Play App Signing → the
  **release-keystore SHA-1 is the final signing cert** (no separate Play App Signing SHA-1 needed).
