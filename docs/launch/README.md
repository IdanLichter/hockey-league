# rinkhockeyil.com — Launch docs (2026-07-12)

Record of the web launch of **rinkhockeyil.com** (self-owned Vercel + Supabase + Cloudflare +
Resend + GA4 + Search Console + GCP OAuth prep).

- **[01-what-we-did.md](01-what-we-did.md)** — everything executed, step by step, with the concrete
  IDs/values.
- **[02-lessons-learned.md](02-lessons-learned.md)** — the gotchas that cost time or nearly broke
  something (Supabase Google-client folding, `smtp_port` string, Cloudflare-WAF vs urllib,
  render-paused background tabs, etc.).
- **[03-remaining-and-future.md](03-remaining-and-future.md)** — optional housekeeping, features
  blocked on inputs, and the bigger future work (native Google/Apple sign-in).

The pre-launch **plan** (access-gated runbook) lives outside this repo in `MOBILE-BUILD/`
(`LAUNCH-PLAN.md`, `WHEN-VERCEL-ACCESS.md`, `WHEN-SUPABASE-ACCESS.md`).
