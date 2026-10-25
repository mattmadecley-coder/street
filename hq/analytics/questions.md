# Questions for Matthew

## Open

**Q (for Product, via GM):** Found and verified a real cause of the
long-standing `results_count: null` gap on search tracking (noted as an
unexplained oddity in several prior check-ins). Root cause:
`CatalogAnalytics` (`components/catalog-analytics.tsx`) lives in the root
`app/layout.tsx`, outside `/catalog`'s own Suspense boundary, and reads
the result count by scraping `.catalog-top .results` text the moment
`searchParams` changes. `app/catalog/loading.tsx`'s skeleton — shown
while the real `app/catalog/page.tsx` streams in — has a `.catalog-top`
div with no `.results` element at all, so if the effect fires during
that loading flash, the scrape returns `undefined` → logged as
`results_count: null`. Because the effect dedups on the serialized
search params, it never retries once the real count streams in, so the
null is permanent for that search. Verified against live data: 7 of the
last 14 tracked searches (50%, 7-day window) have `results_count: null`.
Impact beyond cosmetics: this undercounts the `zeroResultSearches`
feature in `/admin/analytics` (filters on `results_count === 0`) — a
null search never counts as a zero-result search even when it genuinely
was one, so that catalog-gap signal is quietly missing roughly half its
real data. Recommendation (not analytics' call — needs an app-code
change, outside Tier 1 for this department): `app/catalog/page.tsx`
already computes the real count server-side and logs an accurate
`search` event itself via `logSiteEvent(... resultsCount: total ...)`
inside `after()` — worth Product checking whether that server-side log
is actually the one landing in `site_events` for real page loads, and
whether the client-side DOM-scrape in `CatalogAnalytics` is redundant
with it and safe to drop, rather than trying to make the scrape race-safe.
(2026-10-25)

**Q (for Growth-SEO, via GM):** Second consecutive weekly Search Console
comparison shows the same pattern, worse than last time — flagging per
the standing goal to escalate if it persisted. Week 1 (10-09→10-15) vs.
week 2 (10-16→10-22), lag-adjusted: impressions 2,762 → 3,886 (+41%),
clicks 81 → 92 (+13%, not keeping pace), average position 8.6 → 10.5
(continuing to slide, not stabilizing), CTR 2.9% → 2.4%. Pulled the
query-level breakdown for week 2 to see what's driving it: the top
impressions are mostly long-tail branded/product-name searches ranking
at *decent* positions but getting zero clicks — e.g. "akimbotussin" (37
impressions, position 4.6, 0 clicks), "aero fleece black cold culture"
(18 impressions, position 5.7, 0 clicks), "2016 clogs" (7 impressions,
position 11.3, 0 clicks). This reads as a CTR/snippet problem, not a
ranking problem — the pages are showing up fine, just not getting
clicked. Recommendation: worth Growth-SEO checking whether product-page
titles/meta descriptions are compelling for these branded long-tail
queries (not analytics' lane to fix, just the data pointing at it).
(2026-10-25)

## Answered

Format once answered: move the question under here with
`**Q:** ... **A:** ... (YYYY-MM-DD)`.

- **Q:** Could GA4/Search Console service-account access be made to work
  from this environment? **A:** Resolved 2026-10-24 -- the JSON key now
  lives at `street-secrets/new-project-496518-7ef47606461b.json` inside
  `street-work` (gitignored) and `.env.ops.local`'s
  `GOOGLE_APPLICATION_CREDENTIALS` points at it. Verified this run: signed
  a JWT with the key, got a valid OAuth token, and successfully called
  both the GA4 Data API (`runReport`, property 376575603) and the Search
  Console API (`sites.list` + `searchAnalytics.query` for
  `sc-domain:streetdotcom.com`) end to end. No GSC Wizard subscription
  needed. (2026-10-24)
