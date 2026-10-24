# Questions for Matthew

## Assigned by Matthew

- 2026-10-23: Set up separate git worktrees (or standalone clones) per
  department so department agents stop sharing one checked-out working
  directory -- this is what caused today's branch-collision and stale
  `.git/*.lock` incidents (see Product's questions.md for the detail).
  Matthew has approved doing this; decide worktree vs. clone and roll it
  out for all departments. (assigned by Matthew, chat)
- 2026-10-23: Look into the `gh auth status` credential mismatch between
  the scheduled-run sandbox and an interactive shell on the same machine
  (your own open question above) -- Matthew wants this actually
  investigated, not just re-flagged next run. (assigned by Matthew, chat)
  **GM's diagnosis, done live in chat 2026-10-24:** this isn't a
  credential mismatch, it's two different machines. Every scheduled/chat
  run executes inside its own fresh, isolated Linux sandbox
  (`/sessions/rcw-...`) that only has the mounted `street-work` folder --
  it never sees Matthew's actual Windows programs, PATH, or Windows
  Credential Manager. `gh` isn't even installed in that sandbox by
  default (`gh: command not found`); the one time it returned "invalid
  token" it must have been freshly `apt-get install`ed with no saved
  auth. Matthew installing/logging into `gh` on his own Windows machine
  does nothing for these runs -- `gh auth login`'s interactive
  browser/device-code flow can't complete in a one-off headless sandbox
  anyway. Network from the sandbox to github.com works fine (confirmed
  `curl` 200), and `apt-get` is available, so the only missing piece is
  a non-interactive credential. **Recommendation:** Matthew generates a
  fine-grained GitHub PAT for `mattmadecley-coder/street` (Contents:
  read/write, Pull requests: read/write, Actions: read) and adds it to
  `.env.ops.local` as `GH_TOKEN=...` (gitignored, same pattern as
  `COOLIFY_API_TOKEN` -- this is the Tier 3 "change .env.ops.local
  structure" step only Matthew can do). Once that exists, each
  department's run should: `apt-get install -y gh` if missing, then
  `export GH_TOKEN=<value from .env.ops.local>` before any `git`/`gh`
  call -- `gh` reads `GH_TOKEN` natively with no `gh auth login` needed,
  and `git push`/`pull` can use
  `https://x-access-token:$GH_TOKEN@github.com/mattmadecley-coder/street.git`
  as the remote (or a tiny credential helper) instead of the default
  HTTPS prompt that's been failing with "could not read Username." This
  also fixes the push failures GM and Product hit today on two
  unpushed `work` commits.

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
