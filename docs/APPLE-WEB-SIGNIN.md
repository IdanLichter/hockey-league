# Sign in with Apple on the website

**Status (2026-09-26): the code is shipped behind a switch that is OFF.** The button in the
sign-in window and "חיבור Apple" on /me appear only when `VITE_APPLE_WEB_SIGNIN=1`.

## Why it matters

The iPhone app signs people in with Apple; the website only offered Google and email. So a
player who signed up with Apple in the app had **no way into that account on the web**. They
signed up again with Google, claimed their card there, and ended up with two accounts, the app
one showing no card (Ori Raizler, merged by hand 2026-09-26). Duplicates now show up in /admin
→ משתמשי אפליקציה and can be merged there, but this is the fix at the source.

## Why it isn't on yet

The app's Apple sign-in is native: the ID token's audience is the bundle id
`com.arielbiton.rinkhockeyil` and needs no secret. The web uses Apple's redirect flow, which
needs an Apple **Services ID** plus a **client secret** (a JWT signed with a Sign-in-with-Apple
`.p8` key). Only the Apple developer account owner can create those.

## Setup (≈15 min, Apple developer account needed)

1. **developer.apple.com → Certificates, IDs & Profiles → Identifiers → + → Services IDs.**
   Identifier e.g. `com.arielbiton.rinkhockeyil.web`. Enable **Sign in with Apple** → Configure:
   - Primary App ID: `com.arielbiton.rinkhockeyil`
   - Domains: `slpwwoupbbxcgjivcspv.supabase.co`
   - Return URL: `https://slpwwoupbbxcgjivcspv.supabase.co/auth/v1/callback`
2. **Keys → +**, enable Sign in with Apple (primary App ID as above), download `AuthKey_<KEYID>.p8`.
   It downloads **once**. Store it with the signing material (`../rinkhockeyIL-signing/`), never in git.
   Note the Key ID and your Team ID (top-right of the developer site).
3. Generate the client secret:
   ```
   node scripts/apple-client-secret.mjs AuthKey_<KEYID>.p8 <KEYID> <TEAMID> com.arielbiton.rinkhockeyil.web
   ```
4. **Supabase → Authentication → Sign In / Providers → Apple**:
   - Client IDs: `com.arielbiton.rinkhockeyil,com.arielbiton.rinkhockeyil.web`. **Keep the bundle
     id in the list**, or the iPhone app's Apple sign-in breaks.
   - Secret Key (for OAuth): paste the JWT from step 3.
5. **Vercel**: add env `VITE_APPLE_WEB_SIGNIN=1` to the dev project, redeploy dev, test it, then add
   it to the rinkhockeyil.com project and redeploy.
6. **Test**: on dev, sign in with an Apple account that already signed in on the iPhone. It must land
   on the SAME account (same card) the app shows. Then /me → "חיבור Apple" from a Google account.

## ⚠ The secret expires every 6 months

Apple caps the JWT at 6 months. When it expires, web Apple sign-in fails with no alert anywhere
(the app keeps working, since it doesn't use the secret). Re-run step 3, re-paste it in step 4,
and set a calendar reminder for the date the script prints.

## "Hide My Email" users

People who pick Hide My Email get an `…@privaterelay.appleid.com` address. Mail to it only
arrives if the sending domain is registered in the Apple developer account (**Services → Sign in
with Apple for Email Communication**): add `rinkhockeyil.com`, the Resend sending domain.
Otherwise password-reset and notification emails to those users silently vanish.
