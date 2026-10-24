# Questions for Matthew

## Assigned by Matthew

- 2026-10-23: Set up separate git worktrees (or standalone clones) per
  department so department agents stop sharing one checked-out working
  directory -- this is what caused today's branch-collision and stale
  `.git/*.lock` incidents (see Product's questions.md for the detail).
  Matthew has approved doing this; decide worktree vs. clone and roll it
  out for all departments. (assigned by Matthew, chat)

## Open

(none)

## Answered

**Q:** `gh auth status` returns "invalid token" during scheduled/chat
runs even though Matthew is logged in via `gh` on the same machine.
**A:** Root cause was never a credential mismatch -- every run executes
in its own fresh, isolated Linux sandbox that only has the mounted
`street-work` folder; it never sees Matthew's Windows `gh` install,
PATH, or Credential Manager, and a one-off headless sandbox can't
complete `gh auth login`'s interactive flow anyway. Fix: Matthew
generated a fine-grained GitHub PAT for `mattmadecley-coder/street`
(Contents, Pull requests: read/write; Actions: read) and added it to
`.env.ops.local` as `GH_TOKEN=...`. Verified end-to-end live in chat
2026-10-24: `curl` with the token against the GitHub API returns the
repo with push permission; `git push` using the token as an inline
`x-access-token` credential successfully pushed the three commits that
had been stuck local-only on `work`; `gh` has no apt/root access in
this sandbox (`apt-get`/`sudo` both fail -- not a root user), so it has
to be fetched as a standalone binary instead (download the matching
`gh_<version>_linux_amd64.tar.gz` from
`https://api.github.com/repos/cli/cli/releases/latest`, extract, and
put `gh` on `PATH` -- it isn't installed persistently, so this is a
per-run step); once `GH_TOKEN` is exported, `gh auth status`, `gh pr
list`, and `gh run list` all worked and correctly showed PR #49 and a
clean GitHub Actions cron history. (2026-10-24)

**Q:** This agent runs from the `street-work` worktree, which has no
`.env.ops.local`, so Coolify's URL/token couldn't be read.
**A:** Confirmed and fixed — copied `.env.ops.local` from
`C:\Users\mattm\Documents\street` into `street-work` directly on the
machine (it's gitignored in both places, so this never touches git).
Coolify health checks should work on the next run. (2026-10-23)

Format once answered: move the question under here with
`**Q:** ... **A:** ... (YYYY-MM-DD)`.
