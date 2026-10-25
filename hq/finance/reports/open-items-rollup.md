# Weekly open-items rollup — across every department

First pass: 2026-10-24 (morning). Refreshed: 2026-10-24 (evening), 2026-10-25
(morning), 2026-10-25 (afternoon, this pass) — diffs against the prior pass
instead of re-summarizing from scratch. Built by reading each department's
own `questions.md` (Open + Assigned sections) — a summary for Matthew to
scan in one place, not a replacement for the department files themselves,
which have the full detail and recommendations.

## New and escalated since this morning

- **Growth-Social — URGENT, this is now a full outage, not a half-schedule
  bug.** Zero Instagram carousel posts have gone live in ~21 hours (newest
  live post still the 2026-10-24T19:36 UTC carousel). Growth-Social
  cross-checked the live Instagram account directly via the Graph API rather
  than trusting the dashboard, and found `/admin/social` is actively wrong:
  it shows today's on-the-hour slots as `status: "posted"` with a
  `posted_at` that's just the *scheduled* time, not a real publish
  timestamp — a sync step appears to blindly mark slots "posted" once their
  time passes, independent of whether anything actually posted.
  `automation_jobs.ig_carousel` still shows `last_status: "failed"`,
  `"Exit code 1"`. **Finance independently corroborates this**: a Postiz
  "Streak Ended" notification landed in Gmail at 2026-10-25 18:03 ("you
  didn't post anything in the last 24 hours") — an outside signal pointing
  at the same outage. Routed to Product; Growth-Social has not attempted to
  post manually. Recommend treating this as higher priority than the
  original parity-bug report it grew out of.
- **Partnerships (new, Tier 2 — "feed looks broken," flagged for GM) — two
  brand storefronts appear to be down, not just missing a contact email.**
  unknown-london's domain 404s outright; madebycozyus returns HTTP 402 and
  serves Shopify's own "store unavailable" page (lapsed/closed subscription).
  If their products.json feeds are also unreachable, Street may be showing
  stale/broken listings for both. Recommend GM/Catalog check feed sync
  status and consider pausing these listings.
- **Infrastructure (new) — auto-waking Infrastructure off-schedule on a
  failed cron/deploy needs a Product change, not an Infra-side fix.** Traced
  how departments get fired: it's a local Node process spawn
  (`office-app/lib/fire.js`) with nothing calling it from outside the app, so
  GitHub Actions' cloud runners and Coolify's own infra have no path to
  trigger it directly. The realistic shape is a new poll in office-app's own
  scheduler (check `gh run list` / Coolify deploy status every few minutes,
  fire Infrastructure immediately on a failure). Infrastructure is offering
  the exact API calls; this is Tier 2 for them (code change outside their
  area) — routed to GM to coordinate with Product.
- **Catalog Q2 (new, not urgent) — of 35 `needs_review` products, most
  aren't real apparel at all.** Gift cards, "Mystery Box" entries, test rows,
  and odd non-catalog items (a notebook, a lighter, a flag tapestry, etc.)
  pulled in from brand feeds. Catalog fixed 3 legitimate items and is asking
  whether to hide the rest (reversible) or wait for Matthew to review the
  list first.
- **Partnerships — found live alternate contact channels (research only, no
  outreach sent) for 2 of the 8 brands still missing a report email.**
  emestudios has an Instagram handle and a WhatsApp number in its site
  footer; hmdd has an Instagram handle. Neither has a usable email, and
  reaching out on a new channel is outreach (Tier 3 for Partnerships) —
  recommends Matthew or whoever owns the relationship DM them directly.

## Resolved or narrowed since this morning

- **Growth-Lifecycle's missing `.env.local`** — fixed itself this run by
  copying the file in from the main checkout; its own Tier 1 DB reads work
  again. Root cause (whatever rebuilt the worktrees at ~00:36) still
  unaddressed, so it could recur.
- **Analytics' missing `.env.local`** — Analytics' own log shows its Tier 1
  DB checks running clean as of its 13:10 UTC run today, after it fixed its
  own corrupted git-worktree pointer separately. Looks resolved on its own,
  not confirmed by Growth-Lifecycle directly.
- **Billing (Finance's own check)** — re-checked Gmail; no new Anthropic,
  GoDaddy, Postiz, or Netcup charge since the 2026-10-24 20:46 Anthropic
  receipt already on file. GoDaddy sent an "account summary" marketing email
  today, no charge attached.

## Still open from earlier passes — unchanged

- **Partnerships — the unapproved auto-send ran unreviewed for ~3 weeks**
  (`BRAND_REPORTS_AUTO_SEND` live since 2026-10-06). Still needs Matthew's
  confirmation it was intentional, and whether Legal's sign-off happened
  first.
- **Growth-Social — the original half-hour-slot parity bug** (every `:30`
  carousel slot drafted instead of scheduled) is still live underneath
  today's full-outage escalation above. Same thread, same Product routing.
- **Catalog Q1 — the disabled-brand count is 9, not 2.** Needs Matthew: is
  holding all 9 back (7 with real product data, including Pholoh at 240
  products) deliberate, or is onboarding failing to flip a switch?
- **Catalog Q3 — homepage feature schedule has nothing queued after Broken
  Planet** (27 days running). Needs Matthew's rotation cadence preference.
- **Analytics → Growth-SEO — second-week CTR/snippet finding.** Impressions
  up 41% WoW, clicks only +13%, average position still sliding; branded
  long-tail terms ranking fine but getting zero clicks. Routed to Growth-SEO
  to check product-page titles/meta descriptions.

## Needs Matthew's decision (Tier 3 / sign-off)

- **Legal Q1 — SMS fine print + CAN-SPAM mailing address.** Both drafted and
  QA-approved; blocks Growth-Lifecycle's 2-email welcome sequence (both
  QA-approved) and the popup's live SMS wording. Needs: approve SMS fine
  print wording, and set `BRAND_REPORTS_MAILING_ADDRESS`.
- **Growth-Lifecycle Q1 — signup popup is live under unapproved SMS
  wording**, has captured 2 real contacts. Recommend turning it off or
  updating the fine print now, pending the Legal decision above.
- **Legal Q2 — brand permission audit trail is empty** (0 of 91 brands have
  a permission-status record at `/admin/brands`). Matthew's call on whether
  Partnerships should backfill it going forward.
- **Partnerships — bounced report addresses** for 2 brands (Brokenplanet,
  Hmdd) with no alternate contact found; needs Matthew to supply one or
  confirm leaving them paused.
- **Infrastructure — Coolify API token still rejected (401)**, unchanged;
  blocks Coolify deploy-health checks and reading PostgREST's pool settings.
  Needs Matthew to regenerate it in Coolify's UI.
- **Infrastructure — DB connection-pool exhaustion**, diagnosed as
  PostgREST's own `PGRST_DB_POOL` setting. Fixing it needs the Coolify
  token above, then Matthew's sign-off to change a production service
  setting.
- **Infrastructure — `authorize_cron_watchdog` migration drafted, PR #50
  open**, needs Matthew to approve applying it, plus a yes/no on whether he
  wants an active watchdog at all.
- **Growth-SEO — GSC Wizard subscription lapsed**; needs resubscribing at
  tool.gscwizard.com if Matthew wants those Mon/Thu checks back.
- **Product — two-way sync design needs a direction call**
  (`hq/product/drafts/two-way-sync-design.md`) before Product builds
  anything; touches the GM's own agent/charter and needs a new write-scoped
  GitHub token from Infrastructure.

## Ready for Matthew to approve/send (no blocker left once above clears)

- **Partnerships** — AMBYTION decline email ready in Gmail drafts,
  QA-cleared, no blocker.
- **Growth-Lifecycle** — welcome email #1 and #2 (QA-approved sequence) sit
  ready the moment Legal's Q1 clears.

## Flagged for another department (not Matthew directly)

- **Partnerships** — copy bug in `lib/brand-report.ts` (~line 208,
  hardcoded plural "shoppers") routed to Product.
- **Growth-SEO** — three Product-routed fixes, all QA-approved with
  implementation detail spec'd: (1) collection-page metadata, (2) collection
  pages missing from the sitemap, (3, new 2026-10-25) product pages missing
  `BreadcrumbList` structured data despite already having a visible
  breadcrumb nav.
- **Growth-Social → Product** — carousel pipeline outage, above.
- **Analytics → Growth-SEO** — CTR/snippet question, above.
- **Partnerships → GM/Catalog** — two dead brand storefronts, above.
- **Infrastructure → GM/Product** — auto-wake-on-failure poll, above.
- **Product → Infrastructure** — new `HQ_DASHBOARD_GITHUB_TOKEN`
  (read-only, repo-contents-only) needs provisioning.
- **Product → GM** — GM's own write step needs updating to commit
  `hq/_shared/dashboard.json` each run, replacing the old Supabase sync.

## Notes

- No open items in: GM, QA (both clean as of this run).
- Fourth pass in roughly 30 hours. This pass's most important change: a
  known bug (carousel scheduling parity) escalated into a confirmed full
  posting outage with a dashboard actively misreporting it as healthy —
  worth Matthew's attention sooner than the next natural check-in if
  Product hasn't already picked it up.
