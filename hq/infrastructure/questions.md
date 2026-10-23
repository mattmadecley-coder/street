# Questions for Matthew

## Open

- **Q:** Separately from the env file: when I ran `gh auth status`, I got
  "invalid token." Matthew (via chat), running the same command on this
  machine through a different shell, saw a valid logged-in account. So
  `gh` itself may be fine, but whatever shell/environment my Bash tool
  actually runs in during a scheduled run doesn't see the same credential
  — possibly no access to the Windows credential manager/keyring that
  `gh auth status` depends on in that context. This will keep blocking the
  GitHub Actions cron check even with `.env.ops.local` now in place.
  **Recommendation:** try `gh auth status` again on the next scheduled
  run now that `.env.ops.local` exists; if it still fails, this needs
  investigating as an execution-environment issue, not a credentials
  issue. (reopened 2026-10-23, split out from the original question below)

## Answered

**Q:** This agent runs from the `street-work` worktree, which has no
`.env.ops.local`, so Coolify's URL/token couldn't be read.
**A:** Confirmed and fixed — copied `.env.ops.local` from
`C:\Users\mattm\Documents\street` into `street-work` directly on the
machine (it's gitignored in both places, so this never touches git).
Coolify health checks should work on the next run. (2026-10-23)

Format once answered: move the question under here with
`**Q:** ... **A:** ... (YYYY-MM-DD)`.
