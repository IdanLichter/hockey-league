#!/usr/bin/env node
// Client for the `game-form` edge function, used by the cloud routine (ROUTINE.md).
//
//   node scripts/game-form/form.mjs pending
//   node scripts/game-form/form.mjs get <submission_id> <dir>      → <dir>/context.json + <dir>/photo-N.jpg
//   node scripts/game-form/form.mjs result <submission_id> <file.json>
//   node scripts/game-form/form.mjs fail <submission_id> "<reason>"
//
// Needs GAME_FORM_TOKEN in the environment.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const URL = process.env.GAME_FORM_URL || 'https://slpwwoupbbxcgjivcspv.supabase.co/functions/v1/game-form'
const TOKEN = process.env.GAME_FORM_TOKEN
if (!TOKEN) { console.error('GAME_FORM_TOKEN is not set'); process.exit(2) }

async function call(body) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { throw new Error(`HTTP ${res.status}, non-JSON body: ${text.slice(0, 200)}`) }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${data.error || text}`)
  return data
}

const [cmd, id, arg] = process.argv.slice(2)
try {
  if (cmd === 'pending') {
    console.log(JSON.stringify(await call({ action: 'pending' })))
  } else if (cmd === 'get' && id && arg) {
    const ctx = await call({ action: 'get', id })
    mkdirSync(arg, { recursive: true })
    const files = []
    for (const [i, url] of ctx.photos.entries()) {
      const r = await fetch(url)
      if (!r.ok) throw new Error(`photo ${i + 1}: HTTP ${r.status}`)
      const f = join(arg, `photo-${i + 1}.jpg`)
      writeFileSync(f, Buffer.from(await r.arrayBuffer()))
      files.push(f)
    }
    delete ctx.photos
    ctx.photo_files = files
    writeFileSync(join(arg, 'context.json'), JSON.stringify(ctx, null, 2))
    console.log(`wrote ${join(arg, 'context.json')} and ${files.length} photo(s): ${files.join(', ')}`)
  } else if (cmd === 'result' && id && arg) {
    const extracted = JSON.parse(readFileSync(arg, 'utf8'))
    console.log(JSON.stringify(await call({ action: 'result', id, extracted }), null, 2))
  } else if (cmd === 'fail' && id) {
    console.log(JSON.stringify(await call({ action: 'fail', id, error: arg || 'unreadable' })))
  } else {
    console.error('usage: form.mjs pending | get <id> <dir> | result <id> <file.json> | fail <id> "<reason>"')
    process.exit(2)
  }
} catch (e) {
  console.error(e.message)
  process.exit(1)
}
