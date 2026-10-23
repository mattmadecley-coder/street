# Questions for Matthew

## Open

**Q:** Multiple department agents (Product, GM, and apparently others)
share the one `street-work` working directory with no isolation between
runs. Today this caused two real collisions in the same few minutes: (1)
GM's weekly-review commit landed on top of whatever branch Product
happened to have checked out, instead of `work`, because `git commit`
just commits onto the checked-out HEAD of the one shared tree -- it was
rescued onto a side branch and fast-forwarded into `work` by hand, no
data lost, but only because this run happened to notice before doing
anything destructive. (2) A stale `.git/HEAD.lock` and a stale
`.git/objects/maintenance.lock` were left behind by a run that ended
abruptly mid-git-operation, which blocks every `git` command for the
*next* run that touches this folder until someone clears them. Neither
of these needs a schema change or touches app code, so it's logged here
rather than acted on.

**Recommendation:** give each department's run its own git worktree (or
its own full clone) instead of all of them sharing one checked-out
directory -- `git worktree add` against the same `.git` would let every
department branch/commit independently without fighting over which
branch is checked out. Short of that, at minimum each run should check
for and clear stale `*.lock` files under `.git` before doing anything
else, and should never assume the branch it left checked out is still
checked out when it comes back. I did not attempt the worktree
reorganization myself -- same reasoning as the clone-vs-worktree
question below: it's repo/process plumbing, not application code, and
Infrastructure or Matthew should decide the shape of it.

**Update, same run:** while this question was being written, a *second*
copy of this same office-page task finished independently (see Answered,
below) -- most likely another firing of this department's own run
landing in the same window. It used this run's own uncommitted files
(verified identical), committed and pushed them cleanly to
`agent/hq-office-page-v2`, and opened PR #49 -- so no work was lost or
duplicated, but it's the same root cause as above: two runs in the same
shared directory at the same time, this time without collision only by
luck (neither one was mid-write when the other acted).

## Answered

**Q:** `git` doesn't work at all in `street-work` from this agent's
sandbox (not just `gh`) -- can we make `street-work` a standalone clone
instead of a worktree of `street`? **A:** Yes, done. `street-work` is now
a real standalone clone with its own `.git`, `origin` remote, and local
git identity configured -- the old worktree is preserved untouched at
`street-work-old` as a safety net until Matthew deletes it himself. Git
and `gh` both work from this sandbox now. The office-page draft was
applied on top of this fix: branch `agent/hq-office-page-v2`, pushed, PR
opened at https://github.com/mattmadecley-coder/street/pull/49 against
`work`. (2026-10-23)

Format once answered: move the question under here with
`**Q:** ... **A:** ... (YYYY-MM-DD)`.
