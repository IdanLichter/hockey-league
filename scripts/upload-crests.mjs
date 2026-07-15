// scripts/upload-crests.mjs
// One-off migration: move the legacy static /logos/*.png team crests into the
// public `team-logos` Storage bucket, then repoint teams.logo_url at the bucket
// URLs. Idempotent + data-driven — it only touches teams whose logo_url is still
// a '/logos/...' static path, so re-running after a partial run is safe, and it
// never touches main-logo.png (that's the league logo, not any team's logo_url).
//
// Requires SUPABASE_SERVICE_ROLE_KEY in the env (never committed):
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/upload-crests.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const URL = 'https://slpwwoupbbxcgjivcspv.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

const supabase = createClient(URL, KEY, { auth: { persistSession: false } })
const logosDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'logos')

const { data: teams, error } = await supabase
  .from('teams').select('id, name, logo_url').like('logo_url', '/logos/%')
if (error) { console.error('fetch teams failed:', error.message); process.exit(1) }
console.log(`Found ${teams.length} teams with static crests`)

let ok = 0
for (const t of teams) {
  const file = t.logo_url.replace('/logos/', '')
  let buf
  try { buf = readFileSync(join(logosDir, file)) }
  catch { console.error(`  SKIP ${t.name}: file ${file} not found on disk`); continue }
  const path = `${t.id}/${file}`
  const { error: upErr } = await supabase.storage
    .from('team-logos').upload(path, buf, { upsert: true, contentType: 'image/png' })
  if (upErr) { console.error(`  FAIL upload ${t.name}: ${upErr.message}`); continue }
  const { data: pub } = supabase.storage.from('team-logos').getPublicUrl(path)
  const { error: updErr } = await supabase.from('teams').update({ logo_url: pub.publicUrl }).eq('id', t.id)
  if (updErr) { console.error(`  FAIL update ${t.name}: ${updErr.message}`); continue }
  console.log(`  ✓ ${t.name} → ${pub.publicUrl}`)
  ok++
}
console.log(`Done: ${ok}/${teams.length} migrated`)
