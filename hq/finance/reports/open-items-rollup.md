# Weekly open-items rollup — across every department

First pass: 2026-10-24 (morning). Refreshed: 2026-10-24 (evening) — a lot
moved in one day; this pass diffs against the first instead of
re-summarizing from scratch, per that pass's own note. Built by reading
each department's own `questions.md` (Open + Assigned sections) — a
summary for Matthew to scan in one place, not a replacement for the
department files themselves, which have the full detail and
recommendations.

## New and urgent since this morning

- **Partnerships — `BRAND_REPORTS_AUTO_SEND` is live in production and the
  2026-10-23 report batch already sent to all 4 brands with no human
  approval step**, something every department had been operating as if
  still required. Compounds two other problems: Legal's own check-in the
  same day still shows `BRAND_REPORTS_MAILING_ADDRESS` as unset and
  sending as blocked (so prod env may not match what Legal/local
  `.env.local` shows — worth Infrastructure confirming directly against
  the live server), and the known plural/singular copy bug
  (`lib/brand-report.ts` ~line 208) shipped live in Meji Meji's real
  first-ever report. **Needs:** confirm whether auto-send was intentional
  and whether Legal's sign-off actually happened first; decide whether to
  turn auto-send back off until the mailing-address and copy-bug items
  clear.

## Needs Matthew's decision (Tier 3 / sign-off)

- **Legal Q1 — SMS fine print + CAN-SPAM mailing address.** Both drafted
  and QA-approved; blocks Lifecycle from sending anything real (welcome
  email, popup consent text) — and, per the item above, may already be
  moot in production if auto-send is bypassing this. Needs: approve SMS
  fine print wording, and set `BRAND_REPORTS_MAILING_ADDRESS` (entity
  name + PMB/street address).
- **Growth-Lifecycle Q1 — signup popup is live under unapproved SMS
  wording**, has captured 2 real contacts. Recommend turning it off or
  updating the fine print now, pending the Legal decision above.
- **Legal Q2 — brand permission audit trail is empty** (0 of 91 brands
  have a permission-status record at `/admin/brands`). Matthew's call on
  whether Partnerships should backfill it going forward.
- **Partnerships — bounced report addresses** for 2 brands
  (Brokenplanet, Hmdd) with no alternate contact found; needs Matthew to
  supply one or confirm leaving them paused.
- **Infrastructure — Coolify API token rejected (401) again**, blocks
  Coolify deploy-health checks and reading PostgREST's pool settings.
  Needs Matthew to regenerate it in Coolify's UI.
- **Infrastructure — DB connection-pool exhaustion**, now diagnosed:
  PostgREST's own internal pool (`PGRST_DB_POOL`, not Postgres's
  `max_connections`, which has plenty of headroom) is the likely
  bottleneck. Confirming/raising it needs the Coolify token above, then
  Matthew's sign-off to change a production service setting.
- **Infrastructure — `authorize_cron_watchdog` migration drafted, PR
  #50 open**, needs Matthew to approve applying it (Tier 3, DB
  migration), plus a yes/no on whether he wants an active watchdog at
  all — nothing is actively broken without it today.
- **Growth-SEO — GSC Wizard subscription lapsed**; needs resubscribing at
  tool.gscwizard.com if Matthew wants those Mon/Thu checks back. Lower
  priority now that Analytics confirmed a working GA4/Search Console API
  path directly (see Resolved below).

## Ready for Matthew to approve/send (no blocker left once above clears)

- **Partnerships** — AMBYTION decline email ready in Gmail drafts,
  QA-cleared, no blocker.
- **Growth-Lifecycle** — welcome-email draft QA-approved, blocked on the
  same Legal mailing-address/SMS item.

## Flagged for another department (not Matthew directly)

- **Catalog Q1** — two brands stuck mid-onboarding (Skyrat, Emestudios);
  asking Matthew whether that's deliberate.
- **Catalog Q2** — 32 non-apparel/test rows in the review queue,
  recommends hiding them; needs Matthew's go-ahead.
- **Partnerships** — copy bug in `lib/brand-report.ts` (~line 208,
  hardcoded plural "shoppers") routed to Product — now more urgent since
  it shipped live, not just a drafted-email risk.
- **Growth-SEO** — collection pages (`/collections/[slug]`) missing SEO
  metadata (title/description/canonical/OG/Twitter); QA-reviewed fix
  spec'd in detail, routed to Product.
- **Growth-Social** — carousel scheduler bug confirmed systemic: every
  half-hour-mark slot lands as Postiz `DRAFT` instead of scheduled, now
  verified running forward into tomorrow's schedule too (10 slots across
  2 days). Routed to Product.
- **Product → Infrastructure** — new `HQ_DASHBOARD_GITHUB_TOKEN`
  (read-only, repo-contents-only) needs provisioning for `/admin/hq`'s
  new GitHub-Contents-API data source.
- **Product → GM** — GM's own write step needs updating to commit
  `hq/_shared/dashboard.json` each run, replacing the old Supabase sync.
- **Product/Infrastructure/GM** — shared single `street-work` working
  directory caused two real git collisions today. GM found a workaround
  (nested `.worktrees/<dept>/` inside the already-connected folder, no
  new connected folders or Matthew action needed) and recommends building
  it out soon — this is now an execution item for Infrastructure/GM, not
  a decision pending on Matthew.

## Resolved since this morning

- **Analytics** — GA4/Search Console service-account access now
  confirmed working end-to-end (JSON key relocated into the repo's
  gitignored `street-secrets/`, verified live calls to both APIs). No
  GSC Wizard subscription needed for Analytics' own checks.

## Notes

- No open items in: GM, QA (both clean as of 2026-10-24).
- This is a same-day refresh, not next week's pass — the volume of change
  in one day (new urgent Partnerships finding, Analytics resolution,
  Infrastructure's Coolify token flipping back to rejected, two new
  Product-routed bugs) suggests the weekly cadence alone may undersell
  how fast this list moves; worth a mid-week glance if anything here
  looks time-sensitive.
