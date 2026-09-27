// /api/game-form-notify — rings the doorbell for the game-form reading routine.
//
// A referee / league manager just uploaded a photo of the handwritten referee form
// (src/pages/GameResultEntry.jsx → game_form_submissions row, status 'uploaded').
// The Claude cloud routine "Game form reader" (scripts/game-form/ROUTINE.md) is fired by a
// GitHub webhook trigger on `issues.opened` in the fork. So the doorbell is: open an issue
// that says only "a form is waiting", then close it straight away. The routine never reads
// the issue — it asks the `game-form` edge function what is pending — so nothing about the
// game, the players or the photo ever goes to GitHub.
//
// Caller must be signed in and allowed to read the submission. That read is done with the
// CALLER's token, so RLS (can_enter_game_result: admin | league manager | judge) decides,
// exactly as in the browser. Mirrors api/live-edit.js (no npm deps, fails closed).

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ''
const GITHUB_REPO = process.env.GITHUB_REPO || 'sideffect263/hockey-league'

const FETCH_TIMEOUT_MS = 10000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const json = (res, status, body) => res.status(status).json(body)
const timeout = () => (typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(FETCH_TIMEOUT_MS) : undefined)

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  try {
    const chunks = []
    for await (const c of req) chunks.push(c)
    if (!chunks.length) return null
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch { return null }
}

const gh = (path, init = {}) => fetch(`https://api.github.com${path}`, {
  ...init,
  headers: {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'rinkhockeyil-game-form',
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
  },
  signal: timeout(),
})

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return json(res, 405, { ok: false, reason: 'method-not-allowed' })
    }
    if (!SUPABASE_URL || !SUPABASE_ANON) return json(res, 501, { ok: false, reason: 'not-configured' })

    const auth = req.headers?.authorization || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
    if (!token) return json(res, 401, { ok: false, reason: 'unauthorized' })

    const body = await readBody(req)
    const id = String(body?.submission_id || '')
    if (!UUID.test(id)) return json(res, 400, { ok: false, reason: 'invalid' })

    // RLS on game_form_submissions returns the row only to an official; anyone else gets [].
    const r = await fetch(`${SUPABASE_URL}/rest/v1/game_form_submissions?select=id,status&id=eq.${id}`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
      signal: timeout(),
    })
    if (r.status === 401) return json(res, 401, { ok: false, reason: 'unauthorized' })
    const rows = r.ok ? await r.json() : []
    const sub = Array.isArray(rows) ? rows[0] : null
    if (!sub) return json(res, 403, { ok: false, reason: 'forbidden' })
    if (sub.status !== 'uploaded') return json(res, 200, { ok: true, skipped: sub.status })

    if (!GITHUB_TOKEN) {
      console.error('game-form-notify: GITHUB_TOKEN missing')
      return json(res, 501, { ok: false, reason: 'not-configured' })
    }

    const created = await gh(`/repos/${GITHUB_REPO}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'game-form: a referee form is waiting to be read',
        body: 'Doorbell for the "Game form reader" routine (scripts/game-form/ROUTINE.md). '
          + 'Closed automatically; nothing to do here.',
        labels: ['game-form'],
      }),
    })
    if (!created.ok) {
      const detail = await created.text().catch(() => '')
      console.error('game-form-notify: issue creation failed', created.status, detail.slice(0, 300))
      return json(res, 502, { ok: false, reason: 'github-error' })
    }
    const issue = await created.json()
    // The webhook already fired on `opened`; closing keeps the issue list clean.
    await gh(`/repos/${GITHUB_REPO}/issues/${issue.number}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
    }).catch(() => {})
    return json(res, 200, { ok: true })
  } catch (err) {
    console.error('game-form-notify: unhandled error', err?.message || err)
    return json(res, 500, { ok: false, reason: 'error' })
  }
}
