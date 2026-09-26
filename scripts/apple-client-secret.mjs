#!/usr/bin/env node
// Apple web sign-in "client secret" for the Supabase Apple provider.
// Apple doesn't hand out a secret — you sign a JWT with your Sign-in-with-Apple .p8
// key, and Apple caps its life at 6 months. So this MUST be re-run and re-pasted
// into Supabase before it expires, or web Apple sign-in silently starts failing.
// See docs/APPLE-WEB-SIGNIN.md.
//
//   node scripts/apple-client-secret.mjs <path/to/AuthKey_XXXX.p8> <KEY_ID> <TEAM_ID> <SERVICES_ID>
import { readFileSync } from 'node:fs'
import { createPrivateKey, sign } from 'node:crypto'

const [p8, keyId, teamId, servicesId] = process.argv.slice(2)
if (!p8 || !keyId || !teamId || !servicesId) {
  console.error('usage: node scripts/apple-client-secret.mjs <AuthKey.p8> <KEY_ID> <TEAM_ID> <SERVICES_ID>')
  process.exit(1)
}
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const exp = now + 180 * 24 * 3600 - 60 // just under Apple's 6-month maximum
const input = `${b64({ alg: 'ES256', kid: keyId })}.${b64({ iss: teamId, iat: now, exp, aud: 'https://appleid.apple.com', sub: servicesId })}`
const sig = sign('sha256', Buffer.from(input), { key: createPrivateKey(readFileSync(p8)), dsaEncoding: 'ieee-p1363' })
console.log(`${input}.${sig.toString('base64url')}`)
console.error(`expires ${new Date(exp * 1000).toISOString().slice(0, 10)} — put a reminder before that date`)
