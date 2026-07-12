# Remaining & Future Work — rinkhockeyil.com

As of **2026-07-12**, the web launch is complete. Everything below is optional, future, or blocked
on an external input — **nothing here blocks the live site.**

---

## Quick housekeeping

- **Rotate the Resend API key.** The current (sending-only) key was pasted in plaintext during
  setup. Low risk, but good hygiene:
  1. In Resend → API keys, create a new **Sending access** key.
  2. Update Supabase SMTP: `PATCH /config/auth` with the new key as `smtp_pass` (via `curl`).
  3. Delete the old key in Resend.
  - *Claude can't create the key (no account/credential creation) — you create it, then Claude can
    swap it into Supabase.*
- **Test user cleanup** — ✅ done (`arielbiton03+rinkconfirm@gmail.com` deleted).

## Optional features (need one input from you)

- **Poster generator (`api/generate-poster-bg.js`).** Currently returns `503` because its secrets
  aren't set on the new Vercel project. To enable the DALL·E matchday-poster feature, set on Vercel:
  - `OPENAI_API_KEY` — **you provide** (copy from the old Vercel project, or a new OpenAI key).
  - `SUPABASE_SERVICE_ROLE_KEY` — Claude can fetch this from Supabase.
  - `SUPABASE_URL` — same value as `VITE_SUPABASE_URL`.
- **Hebrew-ize the remaining minor email templates.** Done: confirmation, recovery, magic-link,
  email-change. Still English: **reauthentication** (OTP code) and the **notification** emails
  (password-changed, email-changed, etc.). Lower priority; same builder approach.

## SEO / analytics follow-ups (low urgency)

- **Search Console:** the sitemap will flip from "couldn't fetch" to Success within ~a day; then use
  URL Inspection → "Request indexing" on the main pages to speed up first indexing.
- **GA4 ↔ GSC link** and re-scraping social caches (Facebook debugger, X validator) for the new
  domain — nice-to-have from the original `WHEN-VERCEL-ACCESS.md` plan.
- Consider setting `VITE_SITE_URL` handling / canonical for `www` vs apex if any deep links surface.

## Deployment workflow decision (pending)

The app is deployed to the new Vercel account **from the local copy via CLI** — there is **no
auto-deploy on `git push`**, because the source repo (`IdanLichter/hockey-league`) can't be
GitHub-imported by a collaborator. Options to get CI/CD back:

- **Keep CLI deploys** (`vercel deploy --prod --scope rinkhockeyil`) — simplest, fully self-owned.
- **Fork** `IdanLichter/hockey-league` to `sideffect263/hockey-league` and import the fork into
  Vercel — restores auto-deploy, but you maintain a fork.
- **Ask Idan** to install the Vercel GitHub app on his account / add the `rinkhockeyil` Vercel team —
  deploy from the canonical repo, but his account controls the source.

## Native app auth (bigger — actual development, not config)

- **Native Google Sign-In is NOT implemented in the apps** (no `google-services.json` /
  `GoogleService-Info.plist`, no SDK, no client-ID references — only planning docs). The GCP OAuth
  clients (Web/iOS/Android) are **created and wired into Supabase**, ready and waiting.
  - When building it: use Supabase `signInWithIdToken` (audience = one of the registered client IDs).
  - Add the **debug-keystore SHA-1** to the Android OAuth client if testing native sign-in on debug
    builds (the release SHA-1 is already registered for sideloaded release builds).
  - **Publish the GCP consent screen to production** (currently in Testing → only test users can sign
    in). Basic scopes (openid/email/profile) need no Google verification review.
- **Apple Sign-In** — not started. Needs an Apple **Services ID** + a `.p8` key + the
  `.p8`-signed client-secret JWT (expires ≤6 months → recurring rotation). Only required if social
  login is surfaced in the shipped apps (Apple review requires Sign-in-with-Apple wherever Google is
  offered).

## Store / metadata (low urgency)

- Point App Store / Play listing + in-app **privacy & support links** at `rinkhockeyil.com`.

---

### Reference IDs (non-secret)

| Thing | Value |
|---|---|
| Supabase project ref | `slpwwoupbbxcgjivcspv` |
| Vercel team / project | `rinkhockeyil` / `hockey-league` |
| Cloudflare zone | `7d0c400b5f54e69c9d29d4a2f8975de1` (acct `Arielxx263@gmail.com`) |
| Resend sending domain | `send.rinkhockeyil.com` (eu-west-1) |
| GA4 Measurement ID | `G-JPELTXPT8V` |
| GSC property | `sc-domain:rinkhockeyil.com` |
| GCP project | `rinkhockeyil` (#`663565111087`) |
| Android/iOS id | `com.arielbiton.rinkhockeyil` |
| Release SHA-1 | `C9:C9:AA:25:38:61:C2:B0:09:68:2A:6F:47:A7:99:9A:FB:DA:04:B3` |
