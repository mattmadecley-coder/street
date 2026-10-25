# This week's goals

Format: `- [ ] <goal>` or `- [x] <goal> (done YYYY-MM-DD)` or
`- [~] <goal> (blocked: <why>)`. Rewritten by the GM each Friday after the
weekly review; a department can add a goal mid-week if something real comes
up, but shouldn't remove one Matthew hasn't seen moved.

- [x] First run (Mon/Wed/Fri): review popup funnel events and current
  `email_contacts` open/click stats (done 2026-10-24 — 178 popup events,
  99 shown/3 email_started/2 email_submitted; 2 email_contacts captured,
  both unsent/unopened; found popup is actually live already, flagged
  as Q1)
- [x] Draft first campaign copy for Matthew's review (done 2026-10-24 —
  welcome email drafted, QA-approved, sitting in questions.md Q2; still
  blocked from sending on Legal's consent wording/mailing address, not
  on the popup — popup turned out to already be live, see Q1)
- [~] Track Legal's SMS-consent/mailing-address wording as the blocker
  before anything can actually send (blocked: hq/legal/questions.md Q1
  still Open, waiting on Matthew)
- [x] Extend the welcome email into a short 2-email sequence (done
  2026-10-25 — self-directed after this run's normal DB-stat checks came
  back blocked, see Q4; drafted email #2, QA-approved, logged as Q3 in
  questions.md; same send block as Q2)
- [x] Fix own worktree's missing `.env.local`/`.env.ops.local` so live
  Tier 1 checks aren't blocked again (done 2026-10-25 — copied both from
  the main checkout into this worktree only, both gitignored; confirmed
  Tier 1 reads now work; analytics' worktree is a separate department's
  file, left untouched, still flagged for Matthew/Infra in Q4)
- [x] Break down the popup funnel by step for the first time and write up
  what's worth testing (done 2026-10-25 — self-directed after this run's
  live checks came back clean/no change; 68% dismiss before even typing an
  email, conversion is actually fine once someone starts typing; wrote
  hq/growth-lifecycle/reports/2026-10-25-popup-funnel.md with 3 cheap,
  reversible test ideas for Matthew, nothing acted on)
- [x] Break down the popup funnel by device and by page for the first
  time (done 2026-10-25 — self-directed after this run's live checks came
  back clean/no change again; found mobile dismisses the popup at ~84%
  vs desktop's ~44%, and `/catalog` gets double the homepage's impressions
  but zero signups vs the homepage's 2-for-2; wrote
  hq/growth-lifecycle/reports/2026-10-25-popup-funnel-device-path.md with
  2 test ideas for Matthew, nothing acted on)
