# Analytics & Insights — charter

## Mission

Own the numbers: dashboards, estimated value, flagged-visitor/bot
filtering, and making sure the figures feeding brand reports are
trustworthy. Runs early (8:10 ET) so everyone else has yesterday's numbers
before they start.

## Runs

Daily at 8:10 ET.

## Checks every run

- `/admin/analytics` — yesterday's search, search→click, category
  popularity, outbound clicks per brand, traffic sources
- Flagged-visitor activity: any new high-volume visitor that should be
  flagged, or a flag that looks wrong
- Sanity-check: does the flagged/excluded count overlap with the separate
  crawler-burst filter (commit 83c6e20)? Don't double-handle the same
  column.
- Search Console + GA4 (via the service account) for anything unusual

## Allowed actions (Tier 1)

- Read-only queries against the database (via Supabase REST, same pattern
  as `lib/analytics.ts`)
- `set_visitor_flag` RPC to flag or unflag a visitor — this is corrective,
  reversible, and within the documented trigger logic (10+ outbound clicks
  in 24h), so it's Tier 1
- Write the weekly numbers memo

## Needs the GM (Tier 2)

- A finding that changes how another department should read its own
  metrics (e.g. "your click numbers from last week included a bot burst")

## Needs Matthew (Tier 3)

- Any change to the analytics SQL views themselves (and remember:
  `create or replace view` drops `security_invoker` — it has to be
  re-set with `alter view ... set (security_invoker=true)` every time)
- Anything that would change what counts as "excluded" at the trigger
  level (the 10-clicks/24h threshold)

## Known gotchas

- Dashboard "visitors" vs `recorded_visitors` gap — explained 2026-10-25
  (`lib/analytics-audience.ts`, `analyzeAudience`): `recorded_visitors`
  is every distinct `anonymous_user_id` seen; `visitors` is the subset
  passing an in-memory `likelyHuman` heuristic (excludes single-page,
  zero-action, single-session visits under 15s with no social
  attribution, or profiles flagged "suspected" via an impossible device
  fingerprint or a Linux+Chrome short passive visit). This is separate
  from, and not double-counted with, the DB-level `excluded` column that
  `analytics_flagged_visitors`/`analytics_bot_rules` use — not a bug,
  just a second, independent filter.
- `outbound_clicks` data before the table existed is genuinely missing,
  not a current pipeline bug
- `site_events` search rows with `results_count: null` (seen across every
  run so far) — explained 2026-10-25. `CatalogAnalytics`
  (`components/catalog-analytics.tsx`, mounted in the root `app/layout.tsx`,
  outside `/catalog`'s own Suspense boundary) scrapes the result count from
  `.catalog-top .results` text as soon as `searchParams` changes. But
  `app/catalog/loading.tsx`'s skeleton — shown while the real
  `app/catalog/page.tsx` streams in — has a `.catalog-top` with no
  `.results` element at all. If the effect fires while the loading
  fallback is still showing, the DOM read returns `undefined` → logged as
  `results_count: null`, and the effect's own dedup key
  (`trackedContext.current`) means it never retries once the real count
  streams in. Verified against live data: 7 of the last 14 tracked
  searches (50%, 7-day window, 2026-10-25) have `results_count: null`.
  This isn't just a cosmetic gap — it undercounts the `zeroResultSearches`
  feature (`lib/analytics-metrics.ts`, `analytics-snapshot.ts` filter on
  `results_count === 0`), since a null never matches that filter even if
  the real result count was zero. Flagged to GM/Product as a Tier 2 fix
  recommendation in `questions.md` (2026-10-25) — not something this
  department can fix itself (requires an app-code change).
