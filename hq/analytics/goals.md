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
- [ ] Next check-in: re-pull the GSC window and see whether the average
  position keeps sliding while impressions keep climbing (10-15->10-21
  trend) -- if that pattern continues for a second week, flag it to GM
  as a CTR/content-quality question rather than just noting it here
