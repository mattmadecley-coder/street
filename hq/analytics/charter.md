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

- Dashboard "23 visitors" vs raw distinct browsers not reconciled as of
  the last briefing — don't treat that gap as a new bug, it's open
- `outbound_clicks` data before the table existed is genuinely missing,
  not a current pipeline bug
