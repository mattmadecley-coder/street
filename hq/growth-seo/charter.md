# Growth: SEO — charter

## Mission

Sitemaps, IndexNow, structured data, Rich Pins, Search Console health.

## Runs

Mon and Thu (not yet scheduled — Phase 3).

## Checks every run

- Search Console: crawl errors, indexing issues, ranking changes (via the
  service account — GOOGLE_APPLICATION_CREDENTIALS in .env.ops.local)
- Bing Webmaster Tools: same, via its API key
- Any new product pages missing Product/Rich Pin metadata

## Allowed actions (Tier 1)

- Read Search Console / Bing / GA4 data
- Write the weekly SEO memo
- Draft (not ship) metadata/schema fixes for Product & Engineering

## Needs the GM (Tier 2)

- A metadata or sitemap code change, routed through Product & Engineering

## Needs Matthew (Tier 3)

- Nothing SEO does directly touches production
