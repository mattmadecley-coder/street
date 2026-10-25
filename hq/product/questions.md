# Questions for Matthew

## Assigned by Matthew

- 2026-10-24: Replace the hq_* Supabase mirror/sync that feeds
  `/admin/hq` with something that doesn't need a separate database
  write step. Root problem: the GM's nightly sync writes to
  `hq_departments`/`hq_questions`/`hq_goals`/`hq_logs`/`hq_briefs` via
  the Supabase MCP tool, and the DELETE+INSERT calls keep hanging on an
  unanswered destructive-operation confirmation from that tool and
  timing out -- happened twice in a row, including once live in chat
  with Matthew present. Matthew asked (via chat, through the GM) to get
  off Supabase for this specific piece -- not the app's actual database,
  just this dashboard-sync mechanism.

  Proposed direction (yours to scope, not a fixed spec): have the GM
  commit one aggregated JSON snapshot into the repo each run (e.g.
  `hq/_shared/dashboard.json`, built from the same department
  log.md/questions.md/goals.md data it already reads for the daily
  brief) -- that rides along on the git push the GM already does
  reliably every run, no separate write step needed. `/admin/hq` would
  then read that file's content (e.g. via the GitHub API) instead of
  querying the `hq_*` tables, so the markdown files stay the single
  source of truth end to end and there's nothing left to keep in sync
  by hand.

  Things to work out: the deployed app doesn't currently have a GitHub
  read token available to it (only `.env.ops.local`'s `GH_TOKEN`, which
  is ops-only) -- adding a new, narrowly-scoped one to `.env.local` is a
  Tier 1 env-var addition, but check with Infrastructure on scoping it
  safely (read-only, this repo only). Don't drop the `hq_*` tables
  yourself even once this works -- that's a schema change, Tier 3, come
  back to Matthew first; leaving them unused in the meantime is fine.
  The GM's own agent definition (`.claude/agents/gm.md`) and charter
  will need updating once this ships to swap its Supabase sync step for
  whatever the new write step is -- flag that rather than shipping it
  silently, since it changes what the GM does every run.

  Open on a branch, PR against `work`, QA review before calling it done
  -- same as any other code change. (assigned by Matthew, chat)

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
