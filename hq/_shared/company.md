# Street — what every department needs to know

Read this at clock-in. It does not change often; department-specific context
lives in your own charter.md.

## What Street is

A discovery/affiliate catalog for independent streetwear brands — not a
marketplace, not a reseller, no payment/checkout surface on Street itself.
Street imports each onboarded brand's public products.json feed, classifies
it, and lets shoppers browse/search/filter. Every "buy" action sends the
shopper to the brand's own store; the outbound click (`/api/out` →
`outbound_clicks`) is Street's core proof of value to brands.

Site: https://streetdotcom.com
Repo: C:\Users\mattm\Documents\street-work (work happens here, on branch
`work`, pushed with `git fetch; git rebase origin/main; git push origin HEAD:main`)

## The legal/reputational line — never cross this

- Get brand permission, an affiliate relationship, or a sanctioned feed
  before adding a brand to the catalog.
- Never bypass logins, anti-bot controls, or access restrictions on a
  brand's site.
- Always make it easy for a brand to claim, correct, or remove its listing.
- Never scrape or crawl the Site itself at scale, inflate metrics with
  bots, or misrepresent affiliation with a brand — Street's own Terms of
  Service bind Street's own agents too.

## Owner

Matthew. 22, based in the Atlanta/Gwinnett County, GA area. Runs Street
alongside Scale House LLC (a separate business, lead gen for home service
contractors) and a serving job. Has run his own clothing brand and done
marketing for clothing brands — judges ecommerce numbers from hands-on
experience, so don't oversell a metric to him.

## Tech stack (summary — see README.md and the project briefing for detail)

Next.js (App Router) + React + TypeScript. Self-hosted Supabase-compatible
Postgres + PostgREST (not Supabase Cloud). OpenRouter (deepseek/deepseek-chat)
for AI product classification. Self-hosted imgproxy for images. GitHub
Actions for cron (not Vercel Cron). Deploy target is Coolify on a Netcup VPS
(2 vCPU/3.8GB — memory-constrained, keep that in mind for anything
resource-heavy). Email via Resend. Social scheduling via Postiz (being
phased out) and native APIs (Instagram, Pinterest).

## Where things live

- `.env.local` — app-runtime secrets (gitignored, never read into a report)
- `.env.ops.local` — infra-only secrets (gitignored, never read into a report)
- `hq/` — this folder: department charters, goals, logs, questions, reports
- `hq/_shared/decisions.md` — standing decisions that apply to every department

## House rules for every department

1. Never write a secret, API key, or credential value into any hq/ file,
   report, or question — reference the env var name instead.
2. Stay inside your charter's allowed actions. Anything above that is a
   drafted question, not an action.
3. If you see an account checkpoint, ban warning, bounce spike, or error
   spike, stop that activity and raise it as an urgent question — don't
   keep going to see if it clears up.
4. Read hq/_shared/decisions.md every run. A decision there overrides
   anything in your own charter that conflicts with it.
5. Keep your log.md entries to one line per run. Reports go in reports/.
