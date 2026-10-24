# Run log

One line per run: `- YYYY-MM-DD HH:MM: <what happened, in a sentence>`.
Older entries get rolled into a monthly summary once this file grows long —
don't delete history, condense it.
- 2026-10-24 12:15 UTC: First run (bootstrap). Reviewed last-24h/7-day numbers directly over Supabase REST (site_events, outbound_clicks) in place of /admin/analytics itself: traffic is low-volume and nothing looks bot-like beyond the one already-known Asia/Shanghai burst rule from 2026-10-15. Checked all outbound-click activity in the last 7 days against the 10-clicks/24h flag threshold -- max was 4, so no set_visitor_flag call was needed; the 2 existing flagged visitors (2026-10-13, 2026-10-16) still look correctly flagged. Confirmed flagged-visitor exclusion and the crawler-burst rule share the same `excluded` column (not double-handled). Could not verify Search Console/GA4 access (credentials file outside this environment, GSC Wizard connector unsubscribed) -- opened a Tier 3 question. Wrote the first weekly numbers memo to reports/2026-10-24.md and updated goals.md.
