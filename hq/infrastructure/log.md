# Run log

One line per run: `- YYYY-MM-DD HH:MM: <what happened, in a sentence>`.
Older entries get rolled into a monthly summary once this file grows long —
don't delete history, condense it.
- 2026-10-23 14:54: First run (bootstrap). Site reachable (200) and /api/out returns 400 as expected -- no 5xx spike seen. Could not check GitHub Actions cron history or Coolify deploy health: .env.ops.local is missing from this worktree and gh isn't authenticated here; raised as an open question. No brands onboarded yet, so no IMGPROXY_ALLOWED_SOURCES action needed. Proposed initial goals.
- 2026-10-23 21:41: Filed two instructions from Matthew (chat) to "## Assigned by Matthew": set up a git worktree/clone per department to stop the shared-working-directory collisions, and look into the gh auth credential mismatch between the scheduled sandbox and an interactive shell.
