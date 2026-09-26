#!/usr/bin/env node
// Talks to the weekly-preview edge function. See ROUTINE.md for the whole flow.
//
//   node scripts/weekly-preview/preview.mjs facts   [YYYY-MM-DD] > facts.json
//   node scripts/weekly-preview/preview.mjs publish <YYYY-MM-DD> <text.txt> <poster.png> [--dry-run]
//
// Needs WEEKLY_PREVIEW_TOKEN in the environment (or in hockey-league/.env locally).
import { readFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const envFile = path.join(here, '../../.env')
if (!process.env.WEEKLY_PREVIEW_TOKEN && existsSync(envFile)) {
  const m = readFileSync(envFile, 'utf8').match(/^WEEKLY_PREVIEW_TOKEN=(.+)$/m)
  if (m) process.env.WEEKLY_PREVIEW_TOKEN = m[1].trim()
}
const TOKEN = process.env.WEEKLY_PREVIEW_TOKEN
const URL = process.env.WEEKLY_PREVIEW_URL || 'https://slpwwoupbbxcgjivcspv.supabase.co/functions/v1/weekly-preview'
if (!TOKEN) { console.error('WEEKLY_PREVIEW_TOKEN is not set'); process.exit(2) }

async function call(body) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}, non-JSON body` }))
  if (!res.ok || !json.ok) { console.error(JSON.stringify(json)); process.exit(1) }
  return json
}

const [cmd, ...args] = process.argv.slice(2)
if (cmd === 'facts') {
  const r = await call({ action: 'facts', ...(args[0] ? { saturday: args[0] } : {}) })
  console.log(JSON.stringify(r.facts, null, 2))
} else if (cmd === 'publish') {
  const [saturday, textPath, pngPath] = args
  if (!saturday || !textPath || !pngPath) { console.error('usage: publish <YYYY-MM-DD> <text.txt> <poster.png> [--dry-run]'); process.exit(2) }
  const text = (await readFile(textPath, 'utf8')).replace(/\r/g, '').trim()
  const image_base64 = (await readFile(pngPath)).toString('base64')
  const r = await call({ action: 'publish', saturday, text, image_base64, dry_run: args.includes('--dry-run') })
  console.log(JSON.stringify(r))
} else {
  console.error('usage: preview.mjs facts [date] | publish <date> <text> <png> [--dry-run]'); process.exit(2)
}
