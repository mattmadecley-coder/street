# Weekly open-items rollup — across every department

First pass: 2026-10-24 (morning). Refreshed: 2026-10-24 (evening), 2026-10-25
(morning) — this pass diffs against the prior one instead of re-summarizing
from scratch. Built by reading each department's own `questions.md` (Open +
Assigned sections) — a summary for Matthew to scan in one place, not a
replacement for the department files themselves, which have the full detail
and recommendations.

## New and escalated since yesterday evening

- **Partnerships — the unapproved auto-send has been running three weeks,
  not one day.** Checked further back: every brand-report batch since
  `report_date` 2026-10-06 sent itself automatically with zero human
  approval (dozens of brands, 18+ days), not just the single 2026-10-23
  batch flagged yesterday. Doesn't change the ask — confirm whether
  `BRAND_REPORTS_AUTO_SEND` being live was intentional and whether Legal's
  sign-off happened first — just the scale of what shipped unreviewed
  while it was on, including the known plural/singular copy bug.
- **Growth-Social — the carousel scheduler bug now has a second symptom:
  the job itself is failing, not just mis-scheduling.** Same half-hour-slot
  drafting bug is still live today (5/5 again), and on top of it
  `automation_jobs.ig_carousel` logged `last_status: "failed"` / `"Exit
  code 1"` from its 12:05 UTC run today — the first failure in this
  thread; the 12:00 on-the-hour post still went out fine, so the account
  path itself is healthy. Likely the same root cause as the slot-type bug
  now throwing instead of silently mis-tagging. Still routed to Product,
  nothing posted around manually.
- **Catalog Q1 — the disabled-brand count grew from 2 to 9 on a full
  audit.** All 9 were created 2026-09-29 to 2026-10-21 with
  `catalog_enabled = false`; 7 of them (including Pholoh at 240 products)
  have real imported/classified product data sitting invisible to
  shoppers for no technical reason found. One (Hourscollection) is
  separately blocked by its storefront returning HTTP 403. Needs Matthew:
  is holding all 9 back deliberate, or is a step in onboarding failing to
  flip the switch?
- **Catalog Q3 (new) — homepage feature schedule has nothing queued after
  the current brand.** Only 2 rows ever added; Broken Planet has been the
  featured brand for 27 days straight with no successor queued, so it
  stays indefinitely until someone adds a row. Needs Matthew's rotation
  cadence preference, or his go-ahead for Catalog to propose candidates.
- **Analytics (new) — second straight week flags a real SEO problem, now
  routed to Growth-SEO.** Impressions up 41% week-over-week but clicks only
  +13% and average position still sliding (8.6 → 10.5); CTR down to 2.4%.
  Query-level data points at a CTR/snippet problem, not a ranking one —
  branded long-tail terms ranking fine (position 4–6) but getting zero
  clicks. Not a Matthew decision, flagged here so it doesn't get lost —
  Growth-SEO should look at product-page titles/meta descriptions for
  these terms.
- **Growth-Lifecycle Q4 (new, process issue not a Matthew decision) — two
  departments' worktrees were missing `.env.local` this morning**,
  blocking live DB reads for Growth-Lifecycle and (per its own check)
  Analytics too. Growth-Lifecycle found and fixed a related stale
  `.git` pointer bug itself, but can't restore the missing credential
  file without the values. Recommends Infrastructure look at why the
  worktree rebuild dropped a gitignored file that used to carry over.

## Needs Matthew's decision (Tier 3 / sign-off)

- **Legal Q1 — SMS fine print + CAN-SPAM mailing address.** Both drafted
  and QA-approved; blocks Growth-Lifecycle's now-2-email welcome sequence
  (Q2 + new Q3, both QA-approved and ready) and the popup's live SMS
  wording. Needs: approve SMS fine print wording, and set
  `BRAND_REPORTS_MAILING_ADDRESS` (entity name + PMB/street address).
- **Growth-Lifecycle Q1 — signup popup is live under unapproved SMS
  wording**, has captured 2 real contacts. Recommend turning it off or
  updating the fine print now, pending the Legal decision above.
- **Legal Q2 — brand permission audit trail is empty** (0 of 91 brands
  have a permission-status record at `/admin/brands`). Matthew's call on
  whether Partnerships should backfill it going forward.
- **Partnerships — bounced report addresses** for 2 brands
  (Brokenplanet, Hmdd) with no alternate contact found; needs Matthew to
  supply one or confirm leaving them paused.
- **Infrastructure — Coolify API token still rejected (401)**, unchanged
  since yesterday; blocks Coolify deploy-health checks and reading
  PostgREST's pool settings. Needs Matthew to regenerate it in Coolify's
  UI.
- **Infrastructure — DB connection-pool exhaustion**, diagnosed: likely
  PostgREST's own `PGRST_DB_POOL` setting, not Postgres's
  `max_connections` (which has plenty of headroom). Fixing it needs the
  Coolify token above, then Matthew's sign-off to change a production
  service setting.
- **Infrastructure — `authorize_cron_watchdog` migration drafted, PR
  #50 open**, needs Matthew to approve applying it (Tier 3, DB
  migration), plus a yes/no on whether he wants an active watchdog at
  all — nothing is actively broken without it today.
- **Growth-SEO — GSC Wizard subscription lapsed**; needs resubscribing at
  tool.gscwizard.com if Matthew wants those Mon/Thu checks back. Lower
  priority since Analytics has a working GA4/Search Console API path
  directly.
- **Product — two-way sync design needs a direction call** before Product
  builds anything (`hq/product/drafts/two-way-sync-design.md`): give the
  office-app one append-only file to write Matthew's chat answers into,
  which the GM then files into each department's own `questions.md`.
  Touches the GM's own agent/charter and needs a new write-scoped GitHub
  token from Infrastructure, so it's a direction call, not something
  Product can just build.

## Ready for Matthew to approve/send (no blocker left once above clears)

- **Partnerships** — AMBYTION decline email ready in Gmail drafts,
  QA-cleared, no blocker.
- **Growth-Lifecycle** — welcome email #1 (Q2) and a new #2 (Q3, sends ~3
  days later to anyone who hasn't clicked out yet) are both QA-approved
  and sit ready as a sequence the moment Legal's Q1 clears.

## Flagged for another department (not Matthew directly)

- **Partnerships** — copy bug in `lib/brand-report.ts` (~line 208,
  hardcoded plural "shoppers") routed to Product — more urgent now that
  three weeks of auto-sent reports may have carried it.
- **Growth-SEO** — two Product-routed fixes, both QA-approved with
  implementation detail already spec'd: (1) collection pages
  (`/collections/[slug]`) missing title/description/canonical/OG/Twitter
  metadata; (2) those same collection pages are absent from `app/sitemap.ts`
  entirely, so Google has no path to discover them. Pair together — one
  fixes what crawlers see, the other gets them there.
- **Growth-Social** — carousel scheduler bug, now with the added exit-1
  failure signal above. Routed to Product.
- **Analytics → Growth-SEO** — CTR/snippet question above.
- **Growth-Lifecycle/Analytics → Infrastructure** — missing `.env.local`
  in two worktrees, above.
- **Product → Infrastructure** — new `HQ_DASHBOARD_GITHUB_TOKEN`
  (read-only, repo-contents-only) needs provisioning for `/admin/hq`'s
  GitHub-Contents-API data source.
- **Product → GM** — GM's own write step needs updating to commit
  `hq/_shared/dashboard.json` each run, replacing the old Supabase sync.

## Resolved since yesterday evening

- **Infrastructure/GM — per-department git worktrees, done and confirmed
  working.** All 11 departments now run in their own `.worktrees/<dept>/`
  checkout instead of one shared directory; GM confirmed six departments
  did real, substantial work in theirs on today's first clock-in with no
  collisions (this was the Product-flagged shared-directory collision
  risk from yesterday — now closed out). Two small follow-ups noted by GM,
  neither urgent: (1) finance, growth-seo, and infrastructure all crashed
  instantly on today's very first clock-in (Windows access-violation exit
  code, likely several `claude.exe` processes starting too close together
  — GM widened the scheduler's stagger from 20s to 45s as a first
  mitigation); (2) a real `dept-runner.js` bug was found and fixed where a
  run that finished real work just before hitting the old 10-minute
  timeout was wrongly marked "error" — timeout raised to 15 minutes.
- **Analytics** — GA4/Search Console service-account access confirmed
  working end-to-end (carried over from yesterday, still holding).

## Notes

- No open items in: GM, QA (both clean as of this run).
- This is now the third pass in roughly 24 hours. The volume of new,
  escalating, or expanded findings each time (Partnerships' auto-send
  scope, Catalog's brand count, Growth-Social's new failure signal) keeps
  outpacing the weekly cadence — still recommend treating this as a
  living document Matthew can glance at mid-week rather than waiting for
  the Monday rewrite.
