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
- [~] Confirm Search Console + GA4 service-account access actually works
  from this environment (blocked: service-account key file lives outside
  this environment's connected folder, and the GSC Wizard MCP connector
  has no active trial/subscription -- see questions.md)
- [x] Write the first weekly numbers memo (done 2026-10-24,
  hq/analytics/reports/2026-10-24.md)
