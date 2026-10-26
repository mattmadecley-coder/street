# Questions for Matthew

## Open

**Q (for Catalog, via GM):** The `broken_image` event rate that's been bouncing around in recent check-ins (9.7%-21.8% of daily `site_events`, looking like noise) is not actually noise — it traces to a small, stable set of specific product/brand pages with dead image URLs on the brand's own Shopify CDN, not a systemic imgproxy or infra problem. Pulled all `broken_image` events for the last 7 days (589 rows) and grouped by page: only 21 distinct paths account for all of them, and each day's count is driven by just 4-5 real browsing sessions happening to land on one of these pages (e.g. 2026-10-25: 196 events from only 4 sessions, one session alone generating 99 by browsing a gallery where every image 404s). Top offenders by event count:
- `/products/coldcultureworldwide--kiss-in-the-astros-tee-white` (60)
- `/products/namedcollective--malfunction-sporty-crop-zip-hoodie-baby-pink` (54)
- `/products/racer-worldwide--brown-puffer-jacket-x` (54)
- `/products/racer-worldwide--faded-sheepskin-jacket` (45)
- `/products/racer-worldwide--wax-flared-jeans` (39)
- `/products/moremoneymorelove--track-jacket-kopie-1` (37)
- `/products/colebuxton--cb-sportswear-sweatshirt-forest-green` (31)
- `/products/str4wrld--grey-washed-denim` (21)
- plus `/catalog`, `/catalog?page=2`, and `/brands/coldcultureworldwide` (gallery/thumbnail images on listing pages)

Sample broken `metadata.src` values are mostly direct `cdn.shopify.com` URLs returning a dead asset (e.g. `.../malfunction-sporty-crop-zip-hoodie-baby-pink-5.jpg?v=1789376620...`) — this reads as the brand's own product-image file having moved/been deleted/renamed on their Shopify store since the last feed pull, not an imgproxy transform failure (though a few, like the `str4wrld` one, do route through `img.streetdotcom.com` and could be an imgproxy-side issue specifically for those). Recommendation: worth Catalog re-pulling/validating the image URLs for `racer-worldwide` (3 separate broken products — looks like a brand-wide feed staleness issue, not one-off), `namedcollective`, `coldcultureworldwide`, `colebuxton`, `moremoneymorelove`, and `str4wrld`, since this is squarely product/brand-data and imgproxy territory, not analytics' to fix. Not escalating as urgent (doesn't affect data trustworthiness, just storefront image display), but worth fixing since these are real shoppers hitting dead product photos. (2026-10-26)

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

**Update (2026-10-26):** Still unanswered. Re-pulled the window for a
third straight week and the same pattern continued, again getting worse:
week 2 (10-16->10-22) vs. week 3 (10-17->10-23, lag-adjusted) -- clicks
82->100 (+22%), impressions 2,723->4,313 (+58%, outrunning clicks by an
even wider margin than last week), average position 8.98->10.57 (still
sliding), CTR 3.01%->2.32%. Same branded/long-tail zero-click queries
persist in the latest week's top-impressions list (e.g. "2016 clogs" --
still 0 clicks at position 12). Not filing as a new question since the
original stands; just confirming the trend hasn't self-corrected and is
now three weeks running.

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
