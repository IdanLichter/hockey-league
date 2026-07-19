import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync, existsSync } from 'node:fs'

// Routes to snapshot to real HTML so non-JS crawlers / WhatsApp unfurlers see
// content + per-route meta + JSON-LD. Static hubs always; a small sample of
// detail routes (read from the freshly-generated sitemap) to prove the pattern
// without ballooning build time.
const STATIC_ROUTES = [
  '/', '/standings', '/games', '/statistics', '/teams',
  '/players', '/media', '/archive', '/privacy',
]

function sampledDetailRoutes(perKind = 3) {
  const out = []
  try {
    const xml = readFileSync(path.resolve(__dirname, 'public/sitemap.xml'), 'utf8')
    for (const kind of ['/teams/', '/players/', '/games/']) {
      const rx = new RegExp(`<loc>https?://[^/]+(${kind}[^<]+)</loc>`, 'g')
      let m, n = 0
      while ((m = rx.exec(xml)) !== null && n < perKind) { out.push(m[1]); n++ }
    }
  } catch { /* sitemap not generated yet — static routes only */ }
  return out
}

// Prerender is opt-in via PRERENDER=1 so the default `build` (what Vercel runs)
// is never coupled to a headless Chrome being present — it stays rock-solid.
// Even when opted in, a missing/unlaunchable Chrome self-disables the step
// instead of failing the build.
async function maybePrerender() {
  if (!process.env.PRERENDER) return null
  try {
    const { default: puppeteer } = await import('puppeteer')
    const executablePath = puppeteer.executablePath()
    if (!existsSync(executablePath)) throw new Error(`Chrome not found at ${executablePath} (run: npx puppeteer browsers install chrome)`)
    const { default: prerender } = await import('@prerenderer/rollup-plugin')
    const routes = [...STATIC_ROUTES, ...sampledDetailRoutes()]
    console.log(`[prerender] enabled for ${routes.length} routes`)
    return prerender({
      routes,
      renderer: '@prerenderer/renderer-puppeteer',
      rendererOptions: {
        // The app shows a season-gate spinner, then each page runs its own
        // loadData against Supabase. Give that a few seconds to settle before
        // snapshotting (no per-page readiness marker to hook, so time-based).
        renderAfterTime: 3500,
        maxConcurrentRoutes: 2,
        launchOptions: { headless: true, executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] },
      },
    })
  } catch (e) {
    console.warn(`[prerender] disabled — ${e.message}. Build continues without prerender.`)
    return null
  }
}

export default defineConfig(async () => {
  const prerenderPlugin = await maybePrerender()
  return {
    plugins: [react(), prerenderPlugin].filter(Boolean),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
