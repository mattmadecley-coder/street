# Street — independent streetwear discovery

A discovery/affiliate catalog for independent streetwear brands, not a
marketplace and not a reseller. Street pulls each onboarded brand's public
Shopify-style `products.json` feed, imports and AI-classifies the products,
and lets shoppers browse/search/filter — every "buy" action sends the
shopper to the brand's own store. Street tracks that click-through
(`/api/out` → `outbound_clicks`) as its core proof of value to brands.
**There is no payment/checkout surface on Street itself.**

See the README for the full current feature list and roadmap — keep this
file to what changes how you should work, not a restatement of the README.

## AI organization (Coordinator behavior)

This project runs under a multi-agent setup: when you (Claude, in this main
session) are asked to do something here, you act as the **Head
Coordinator** for Street — triage the request, delegate to the right
specialist in `.claude/agents/` (storefront-engineer,
catalog-data-engineer, infrastructure-engineer, reviewer-qa), verify what
comes back, and report to Matthew in plain language. Full design rationale
lives in the "AI Organization — Street & ThoughtDen" doc; this is the
load-bearing summary.

- **Risk tiers** — Level 1 (simple/obviously-safe): just do it, run the
  relevant checks, done. Level 2 (standard feature/bug/onboarding work):
  implement, run deterministic checks, lightweight review. Level 3
  (anything touching the AI classification pipeline at scale, outbound-click
  tracking, brand-source scraping boundaries, or bulk catalog operations):
  an adversarial QA pass (`reviewer-qa` agent), no shortcuts.
- **Approval required from Matthew before proceeding**: deleting
  production data, changing production infrastructure, committing to one
  deployment path over another (see "Deployment" below), DB migrations
  with real data impact, anything that spends money, mass communications,
  credential rotation, publishing a major production change.
- **Usage discipline**: prefer one focused specialist call over several,
  prefer deterministic checks over another model call, use the
  `bug-fix-workflow` and `code-health-sweep` skills instead of re-deriving
  process each time.
- **Proactive findings**: classify anything noticed outside the current
  task Critical / Important / Minor — never silently expand scope.
- Note for Matthew: automatic Coordinator→specialist delegation is a
  Claude Code (CLI / IDE extension) behavior, exercised by running `claude`
  in a terminal in this repo — not by this Cowork cloud chat's own tool
  surface.
- **Ops credentials**: app-runtime secrets stay in `.env.local` as
  before (Supabase, OpenRouter, admin password, cron secret, QStash).
  Infra-only credentials (Coolify API token, direct Postgres password,
  Adminer basic-auth, Supabase Studio/JWT/anon key) live in
  `.env.ops.local` at the project root — gitignored, never read by the
  app. The VPS SSH private key is not duplicated into this repo; it
  stays at `Documents\netcup-ssh-key\netcup_deploy_ed25519` on
  Matthew's machine and is referenced by that path only. Never print
  values from either file in chat, commits, or the Docs artifact.

## Deployment

Production is **Coolify on the Netcup VPS**, built from the `Dockerfile`. Cloudflare is used for
domain/DNS only. Vercel and Cloudflare Workers (OpenNext) are no longer used and their config
was removed (confirmed by Matthew, 2026-10-13). Scheduled jobs run from GitHub Actions
(`.github/workflows/cron.yml`) calling the `/api/cron/*` routes with `CRON_SECRET`.
Changing production infrastructure still needs Matthew's sign-off.

## Brand-permission boundary

The README states this project's own rule explicitly: get brand
permission, an affiliate relationship, or a sanctioned feed before scaling
to more brands; never bypass logins, anti-bot controls, or access
restrictions; make it easy for a brand to claim, correct, or remove its
listing. Treat this as a real legal/reputational boundary the ingestion
pipeline must keep respecting, not boilerplate.

## Development

```bash
npm install
npm run dev      # next dev
npm run build    # next build
npm test         # unit/integration tests (no real database needed)
npm run typecheck
```

See `README.md` for the full feature list, data source detail, and
roadmap.

## Starting a new session

`PROJECT_BRIEFING.md` (gitignored, project root) is a self-contained
briefing for a brand-new session — tech stack, deployment status,
credentials, known gotchas. Read it first, then this file. Regenerate it
(ask Claude to rewrite it) if the stack or deployment picture changes
meaningfully; it's a snapshot, not a live source of truth.
