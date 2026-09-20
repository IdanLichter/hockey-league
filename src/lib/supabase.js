import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Telemetry hooks in here rather than the other way round, so this module keeps
// importing nothing and there is no cycle between the client and the reporter.
// Until initTelemetry() registers one, this is a no-op.
let reportRequest = null

/**
 * Register a reporter for Supabase requests.
 * @param {(info:{path:string,method:string,status:number,ok:boolean,duration_ms:number})=>void} fn
 */
export function setRequestReporter(fn) { reportRequest = fn }

/**
 * Every REST/RPC/storage call the app makes goes through this fetch, so a rejected
 * request is recorded exactly once, at the only place that sees all of them.
 *
 * This is the instrument that would have caught the two most expensive bugs in this
 * project's history: a 403 from a column-level grant, and a row-level policy quietly
 * returning nothing. Both are HTTP-visible here and invisible everywhere else, because
 * callers wrap them in try/catch or `.catch(() => [])` and carry on looking healthy.
 *
 * It is also where "what did users actually DO" comes from. Every write the app makes
 * is a POST/PATCH/DELETE through here, so the action log builds itself — no call site
 * has to remember to report, and none can drift out of date. Successful READS are not
 * recorded: they are high-volume, they are already in the edge log, and page views
 * answer that question better.
 */
const instrumentedFetch = (input, init) => {
  const started = Date.now()
  const report = (status, ok) => {
    try {
      if (!reportRequest) return
      const url = new URL(typeof input === 'string' ? input : input.url)
      reportRequest({
        // Path only, never the query string: filters carry ids, emails and names.
        path: url.pathname,
        method: (init?.method || 'GET').toUpperCase(),
        status,
        ok,
        duration_ms: Date.now() - started,
      })
    } catch { /* reporting must never affect the request */ }
  }
  return fetch(input, init).then(
    (res) => { report(res.status, res.ok); return res },
    (err) => {
      // The request never completed — offline, DNS, a blocked origin. This is the
      // case the edge log can NEVER show you, because nothing reached the server.
      report(0, false)
      throw err
    },
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: instrumentedFetch },
})
