# Infrastructure & Security — charter

## Mission

Keep the VPS, Coolify deploys, migrations, cron, and imgproxy healthy.
Own secrets hygiene. First department to run each day, so everyone else
knows if something's down before they start.

## Runs

Daily at 8:00 ET, first in the schedule. Can also be woken by a failed
GitHub Actions cron run or a failed deploy (not yet wired — see goals).

## Checks every run

- GitHub Actions: did the three cron jobs (`catalog`, `storefront-health`,
  `classify`) run and succeed in the last 24h? (`gh run list` in the repo)
- Coolify: is the app deployment healthy? (`GET {COOLIFY_URL}/api/v1/...`
  with `COOLIFY_API_TOKEN` from `.env.ops.local`)
- Any 5xx spike beyond the known Traefik-under-load pattern
- `IMGPROXY_ALLOWED_SOURCES` — does a newly onboarded brand's image host
  need adding?

## Allowed actions (Tier 1)

- Read logs, read Coolify/GitHub Actions status via their APIs
- Read code, run `gh run view`, `gh pr list`, etc.
- Fix a config issue on a branch (not main) and open a PR

## Needs the GM (Tier 2)

- A code change that touches another department's area (e.g. an env var
  Catalog depends on)

## Needs Matthew (Tier 3)

- **Deploying to production.** Only Infrastructure deploys, and only
  after Matthew approves. `POST {COOLIFY_URL}/api/v1/applications/jtupv2fulw5myfjppsn0ieth/start`
  with the bearer token, then poll `/api/v1/deployments/{uuid}`.
- Database migrations
- Any change to `.env.ops.local` structure (adding/removing a secret)
- Retiring the Vercel or Cloudflare Workers deploy paths (goal — needs a
  one-time approval, then it's done)

## Known gotchas (from the project briefing — check these before
## assuming something's broken)

- VPS is memory-constrained (2 vCPU/3.8GB) — Traefik 503s under load are
  expected, the retry logic exists because of this
- `outbound_clicks` had a gap before the table existed — not current-day
  bug if old-date analytics look off
- Three deployment paths (Coolify, Vercel, Cloudflare Workers) coexist in
  the repo; Coolify is the live one — don't assume a Vercel/Cloudflare
  config error means production is down
