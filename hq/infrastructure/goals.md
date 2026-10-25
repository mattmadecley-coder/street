# This week's goals

Format: `- [ ] <goal>` or `- [x] <goal> (done YYYY-MM-DD)` or
`- [~] <goal> (blocked: <why>)`. Rewritten by the GM each Friday after the
weekly review; a department can add a goal mid-week if something real comes
up, but shouldn't remove one Matthew hasn't seen moved.

- [x] Get Coolify status access working from the street-work worktree
  (done 2026-10-23: .env.ops.local copied in)
- [x] Get GitHub Actions cron-status checks working (done 2026-10-24:
  fixed via GH_TOKEN in .env.ops.local, fetching `gh` as a standalone
  binary each run -- see questions.md Answered. Confirmed again today:
  `gh run list` shows catalog/storefront-health/classify all ran and
  succeeded in the last 24h, just delayed several hours past their
  scheduled times, matching the known "GitHub often runs late" note in
  cron.yml)
- [x] Confirm the Coolify deploy-health check actually runs successfully
  now that `.env.ops.local` is present in this worktree (done
  2026-10-24: GET /api/v1/applications/<uuid> returns 200,
  status: running:unknown; also pulled the app's own container logs via
  /logs, which works and surfaced two real issues -- see questions.md
  Open)
- [x] (unplanned, found during this check-in's Tier 1 pass) Fix the CI
  `checks` job failing on every PR since 2026-10-23 (done 2026-10-24:
  root tsconfig.json had no exclude for `hq/`, so `tsc --noEmit` was
  type-checking Product's staged, not-yet-applied
  `hq/product/drafts/office-page/` draft code against the repo-root
  path aliases it wasn't written to resolve under. Added `hq/**` to
  `tsconfig.json`'s exclude on branch `infra/exclude-hq-from-typecheck`,
  opened PR #51, confirmed CI `checks` now passes -- was failing with 20
  TS errors before the fix. Didn't touch any Product file. PR #51 open,
  not merged -- leaving the merge decision rather than self-merging a
  cross-department-adjacent fix. Also means PR #50 (cron watchdog
  migration) should pass CI once #51 merges.)
- [~] Wire up a failed GitHub Actions cron run or failed Coolify deploy to
  wake Infrastructure off-schedule (blocked: traced the mechanism
  2026-10-24 -- `fireDepartment()` only works as a local spawn inside
  office-app on Matthew's machine, and GitHub Actions' cloud runners /
  Coolify's own infra have no path to call it directly. The fix is a
  poll-and-fire addition to office-app's own scheduler, which is
  Product's code, not Infra's -- filed in questions.md Open as a Tier 2
  recommendation for the GM to coordinate with Product rather than
  building it myself)
- [ ] Add a container-log check for DB connection-pool-exhaustion errors
  to the regular checks (found 120+ "Timed out acquiring connection
  from connection pool." errors in today's log pull, 2026-10-24 -- see
  questions.md Open. Worth checking every run going forward, not just
  as a one-off.)
- [ ] Get Matthew's one-time approval to retire the unused Vercel/Cloudflare
  Workers deploy paths, then remove them from the repo
