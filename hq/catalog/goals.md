# This week's goals

Format: `- [ ] <goal>` or `- [x] <goal> (done YYYY-MM-DD)` or
`- [~] <goal> (blocked: <why>)`. Rewritten by the GM each Friday after the
weekly review; a department can add a goal mid-week if something real comes
up, but shouldn't remove one Matthew hasn't seen moved.

- [x] First run: check the `classification_status = needs_review` backlog
  in `/admin/products` and clear what's safely fixable (done 2026-10-24 --
  35 -> 32, 3 cleared, rest flagged as non-apparel/junk in questions.md)
- [x] Audit for knitwear misfiled under the wrong `street_type` (done
  2026-10-24 -- found and fixed 17 products, QA-approved)
- [x] Confirm `trigger_url`/`trigger_token` are set for every product that
  should be classified (done 2026-10-24 -- both set on the watchdog row,
  0 pending/error backlog)
- [x] Self-directed: audit every `catalog_enabled = false` brand (not just
  the 2 already flagged) and the homepage feature schedule for staleness
  (done 2026-10-25 -- found 7 more disabled brands beyond Q1's original 2,
  including Pholoh at 240 imported products sitting invisible; ruled out
  my own `metadata_synced_at` theory before reporting it; confirmed all 9
  disabled brands' images are on cdn.shopify.com with no imgproxy gap;
  found the homepage schedule has had nothing queued since 2026-09-28 --
  both written up in questions.md Q1/Q3 for Matthew)
- [x] Self-directed: audit every live (`catalog_enabled = true`) brand's
  name/logo/Instagram handle against its own homepage og:site_name, not
  just the 14 recently onboarded ones already checked (done 2026-10-25 --
  scanned all 82 enabled brands, found one real mismatch: "Pay Billions"
  (paybillions.com) whose own og:site_name/og:title both read "BILLIONAIRE
  STUDIOS" and whose existing instagram_url/logo_url already matched that
  name, not "Pay Billions" -- fixed the `name` field only, QA-approved;
  also checked the 7 highest-product-count live brands with no
  instagram_url on file for a link in their raw homepage HTML -- found
  none, likely JS-rendered footers that a static fetch can't see, so
  nothing fixable there this way)
- [x] Self-directed: audit all 82 `catalog_enabled = true` brands for a
  missing `logo_url` (done 2026-10-26 -- found 8 with none at all
  (peso-clothing, denim-tears, lostboysarchives, fffpostalservice,
  unknown-london, no-maintenance, syna, homage-year); fetched each brand's
  own live homepage looking for a real header-logo asset rather than
  guessing from an og:image lookbook photo -- only Lost Boys Archives had a
  clear one (`header__heading-logo` img tag), set `logo_url` from it,
  verified the URL resolves to a real 200 PNG, QA-approved; the other 7 are
  JS-rendered sites where a static fetch can't find the logo, left alone
  rather than guess wrong)
