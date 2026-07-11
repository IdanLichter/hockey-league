// Skip the Chromium download during `npm install` / `npm ci`. Prerender is
// opt-in (PRERENDER=1) and Vercel does NOT run it, so the build host never needs
// Chromium — this keeps installs fast and can't fail on a Chromium fetch. A local
// `npm run build:prerender` uses the already-cached browser, and vite.config
// self-disables prerender if Chrome isn't resolvable.
module.exports = { skipDownload: true }
