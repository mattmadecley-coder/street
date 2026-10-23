# This week's goals

Format: `- [ ] <goal>` or `- [x] <goal> (done YYYY-MM-DD)` or
`- [~] <goal> (blocked: <why>)`. Rewritten by the GM each Friday after the
weekly review; a department can add a goal mid-week if something real comes
up, but shouldn't remove one Matthew hasn't seen moved.

- [x] Get Coolify status access working from the street-work worktree
  (done 2026-10-23: .env.ops.local copied in)
- [~] Get GitHub Actions cron-status checks working (blocked: `gh auth
  status` reports an invalid token inside this agent's own sandboxed run
  even though the same command in an interactive shell on the machine
  shows a valid login — looks like an execution-environment issue, not a
  credentials one; retry on the next scheduled run now that
  `.env.ops.local` is in place)
- [ ] Confirm the Coolify deploy-health check actually runs successfully
  now that `.env.ops.local` is present in this worktree — the file was
  copied in this week but the check itself hasn't been exercised yet
- [ ] Wire up a failed GitHub Actions cron run or failed Coolify deploy to
  wake Infrastructure off-schedule (charter notes this isn't wired yet)
- [ ] Get Matthew's one-time approval to retire the unused Vercel/Cloudflare
  Workers deploy paths, then remove them from the repo
