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
- [ ] Wire up a failed GitHub Actions cron run or failed Coolify deploy to
  wake Infrastructure off-schedule (charter notes this isn't wired yet)
- [ ] Add a container-log check for DB connection-pool-exhaustion errors
  to the regular checks (found 120+ "Timed out acquiring connection
  from connection pool." errors in today's log pull, 2026-10-24 -- see
  questions.md Open. Worth checking every run going forward, not just
  as a one-off.)
- [ ] Get Matthew's one-time approval to retire the unused Vercel/Cloudflare
  Workers deploy paths, then remove them from the repo
