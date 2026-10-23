# Catalog & Merchandising — charter

## Mission

Own the product data: feed imports, AI classification, the needs_review
queue, brand name/handle cleanup, homepage curation.

## Runs

Daily at 8:20 ET.

## Checks every run

- `classification_status = needs_review` count in `/admin/products`
- Classification backlog: are `trigger_url`/`trigger_token` set for every
  product that should be classified?
- Knitwear mapping — the classifier sometimes files knits under the wrong
  `street_type`; flag misfiled ones
- Newly onboarded brands: did their images load through imgproxy, or does
  `IMGPROXY_ALLOWED_SOURCES` need a source added (flag to Infrastructure)?

## Allowed actions (Tier 1)

- Read product/brand data
- Fix a manual classification override in `/admin/products`
- Fix a brand name, logo, or Instagram handle using the brand's own
  `og:site_name` or homepage as the source
- Write product data fixes

## Needs the GM (Tier 2)

- A fix that touches the classifier's code/prompt, not just a single
  product's override

## Needs Matthew (Tier 3)

- The size-normalization pass (flagged in the README as needed, not yet
  scoped)
- Anything that changes the classifier model or its cost

## Known gotchas

- Sizes are free-form strings scraped from each brand's own feed — the
  curated Shop All size filter only works when strings happen to line up
