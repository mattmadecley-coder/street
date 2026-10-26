# This week's goals

Format: `- [ ] <goal>` or `- [x] <goal> (done YYYY-MM-DD)` or
`- [~] <goal> (blocked: <why>)`. Rewritten by the GM each Friday after the
weekly review; a department can add a goal mid-week if something real comes
up, but shouldn't remove one Matthew hasn't seen moved.

- [x] First run: review `/admin/analytics`' latest search, search→click,
  category-popularity, and outbound-click numbers for anything unusual
  (done 2026-10-24)
- [x] Confirm flagged-visitor activity and the separate crawler-burst
  filter (commit 83c6e20) aren't double-handling the same exclusion
  column (done 2026-10-24)
- [x] Confirm Search Console + GA4 service-account access actually works
  from this environment (done 2026-10-24: key file now lives in
  `street-secrets/` inside street-work; verified live GA4 `runReport` and
  GSC `searchAnalytics.query` calls against it)
- [x] Write the first weekly numbers memo (done 2026-10-24,
  hq/analytics/reports/2026-10-24.md)
- [x] Wire GA4 + Search Console checks into the regular run routine (not
  just ad-hoc scratch scripts) now that credentials work (done
  2026-10-24: wrote `hq/analytics/gsc-ga4-recipe.md` -- a documented,
  tested JWT-sign-and-call recipe with the full working script inline,
  re-verified against both APIs this run. Kept it as a paste-and-run
  scratch snippet rather than a committed script under `scripts/`,
  since adding app code is outside Tier 1 for this department)
- [x] Use the recipe above during the regular run routine going
  forward (not just the proof run) and start noting week-over-week GSC
  trend (clicks/impressions/position) in the weekly memo (done
  2026-10-24: ran the recipe this check-in, pulled a 2-week GSC window,
  logged the first week-over-week comparison in
  hq/analytics/reports/2026-10-24.md -- clicks flat 85->83, impressions
  +29% 2679->3453, average position softened ~8.5->~9.9)
- [x] Next check-in: re-pull the GSC window and see whether the average
  position keeps sliding while impressions keep climbing (10-15->10-21
  trend) -- if that pattern continues for a second week, flag it to GM
  as a CTR/content-quality question rather than just noting it here
  (done 2026-10-25: it did, and worsened -- week1 10-09->10-15 vs week2
  10-16->10-22: impressions 2762->3886 (+41%), clicks 81->92 (+13%,
  not keeping pace), position 8.61->10.53 (slid further), CTR 2.9%->2.4%.
  Pulled query-level detail: top-impression queries are long-tail
  branded/product-name searches at decent positions (pos 3-11) getting
  zero clicks -- looks like a CTR/snippet issue, not a ranking problem.
  Filed as a Tier 2 question for Growth-SEO via GM in questions.md)
- [ ] Keep the full charter checklist (search, search->click, category
  popularity, traffic sources, outbound-clicks-by-brand over
  `site_events`/`outbound_clicks`) in the regular run rotation, not just
  the DB-aggregate + GSC/GA4 checks -- those site_events breakdowns ran
  in the first-ever check-in (2026-10-24) but had quietly dropped out of
  every run since. Restored 2026-10-25 and ran it again this check-in
  (see reports/2026-10-25.md, "Fourth run") -- still clean. Standing
  routine, not a one-off: keep doing it every check-in. (Ran again
  2026-10-25, fifth run -- still clean. Ran again 2026-10-26 (two
  check-ins) -- clean both times; first caught a single-visitor "jeans"
  search session worth a second look (see below), second caught a
  `results_count: 1000` search log that looked like a page-cap bug but
  verified as a real match count.)
- [x] Self-directed: explain the long-standing `results_count: null`
  search-tracking gap (noted as unreconciled across multiple prior
  check-ins) instead of continuing to log it as a known-but-unexplained
  oddity (done 2026-10-25: traced it to `components/catalog-analytics.tsx`
  scraping `.catalog-top .results` text before the real `/catalog` page
  streams past its `loading.tsx` skeleton -- that skeleton has no
  `.results` element, so the scrape returns `undefined` and the effect's
  dedup key means it never retries. Verified 7/14 (50%) of the last 7
  days' tracked searches have `results_count: null`, and showed this
  undercounts the `zeroResultSearches` admin-analytics feature. Documented
  in charter.md's Known Gotchas and filed a Tier 2 fix recommendation for
  Product via GM in questions.md, since fixing it needs an app-code
  change outside this department's Tier 1.)
- [x] Self-directed: explain the "dashboard visitors vs raw distinct
  browsers" gap noted as unreconciled in charter.md's Known Gotchas
  (open since the first briefing) instead of leaving it an open mystery
  (done 2026-10-25: read `lib/analytics-audience.ts`'s `analyzeAudience`
  -- `recorded_visitors` is every distinct `anonymous_user_id` seen;
  `visitors` is the subset passing a `likelyHuman` heuristic (excludes a
  profile if it's a single-page, zero-action, single-session visit under
  15s with no social attribution, or flagged "suspected" via an
  impossible device fingerprint or Linux+Chrome short passive visit).
  This is a separate, in-memory, per-query heuristic -- NOT the same
  mechanism as the DB-level `excluded` column used by
  `analytics_flagged_visitors`/`analytics_bot_rules`. Matches the
  observed gap (e.g. 2026-10-24: 51 visitors vs 53 recorded). Updated
  charter.md's Known Gotchas bullet with this explanation so it's no
  longer logged as "not reconciled.")
- [x] Self-directed: during this check-in's charter checklist, a single
  visitor's search history showed ~70 `site_events` rows for query
  "jeans" in a 7-day pull, which looked like a possible duplicate-event
  or bot-loop bug worth investigating rather than waving off (done
  2026-10-26: traced it -- the visitor genuinely searched "jeans" 5
  times over ~2.5 hours and browsed 62 product cards on the results
  page, each `product_impression` event legitimately carrying the active
  `query` value for attribution. Confirmed via a full event-type
  breakdown for that `anonymous_user_id` (76 events total: 6 page_view,
  3 page_performance, 5 search, 62 product_impression) -- a normal
  single-session browse, not a tracking bug or bot. No action needed;
  noting the investigation so a future run doesn't re-chase the same
  false alarm.)
- [x] Self-directed: re-examine the `broken_image` event-share volatility
  noted as unescalated noise across the last several check-ins (9.7%-
  21.8% swings) -- pull enough data to say whether it's a growing
  site-wide trend or something else (done 2026-10-26: used exact-count
  range queries per day, since the naive 7-day pull silently hit
  PostgREST's 1000-row default page cap and undercounted -- found 589
  `broken_image` events over 7 days trace to only 21 distinct pages,
  each day's count driven by a handful of sessions hitting one of those
  specific broken pages. Root cause: dead `cdn.shopify.com` image URLs on
  specific products, concentrated in a few brands (`racer-worldwide` x3,
  `namedcollective`, `coldcultureworldwide`, `colebuxton`,
  `moremoneymorelove`, `str4wrld`). Documented in charter.md's Known
  Gotchas and filed a Tier 2 fix recommendation for Catalog via GM in
  questions.md with the full page list, since fixing it needs a brand
  feed re-pull/product-data fix, outside this department's Tier 1.)
- [x] Self-directed: a search-event log line showed `results_count: 1000`
  for "jeans" twice in the same 24h pull -- round number, same value as
  PostgREST's default page cap that's already bitten this department
  twice this week, so worth verifying it was a real total and not a
  silently-capped one before letting it pass (done 2026-10-26, second
  check-in: called the `search_products_ranked` RPC directly with
  explicit high limits (2000, 50000) for the actual expanded tsquery
  ("jean | denim" -- "jean"/"denim" are a documented synonym pair in
  `lib/catalog-ranking.ts`) and got the same 1000 every time, while an
  unrelated single-term query ("jean" alone) returned 162 -- confirming
  1000 is `denim`'s genuine match count against the current ~13.6k-product
  active catalog, not a capped artifact. No bug, no action needed;
  logging so a future run doesn't re-chase this exact number.)
- [x] Self-directed: since social growth is the current company priority
  and no prior check-in has ever looked at *conversion*, not just
  volume, by traffic source, pulled a 7-day landing-attribution-to-
  outbound-click conversion rate per source (done 2026-10-26, second
  check-in: joined each visitor's first `page_view` referrer/utm
  against whether they ever logged an `outbound_click` in the same
  window. Found Instagram (`utm:ig`) converting at 3.1% (1/32) vs.
  google organic 11.0% (14/127) and `utm:chatgpt.com` 12.9% (4/31) --
  the lowest rate of any source with real volume. Filed as a Tier 2
  question for Growth-Social via GM with the full table, framed as a
  one-time data point worth a second week's pull before treating as a
  trend, not an alarm.)
