# This week's goals

Format: `- [ ] <goal>` or `- [x] <goal> (done YYYY-MM-DD)` or
`- [~] <goal> (blocked: <why>)`. Rewritten by the GM each Friday after the
weekly review; a department can add a goal mid-week if something real comes
up, but shouldn't remove one Matthew hasn't seen moved.

- [x] Get Coolify status access working from the street-work worktree
  (done 2026-10-23: .env.ops.local copied in)
- [~] Get GitHub Actions cron-status checks working (blocked: gh reports
  an invalid token inside this agent's own run even though it's
  authenticated in an interactive shell — see open question, 2026-10-23)
- [ ] Wire up a failed GitHub Actions cron run or failed Coolify deploy to
  wake Infrastructure off-schedule (charter notes this isn't wired yet)
- [ ] Get Matthew's one-time approval to retire the unused Vercel/Cloudflare
  Workers deploy paths, then remove them from the repo
