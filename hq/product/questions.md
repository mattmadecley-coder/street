# Questions for Matthew

## Open

**Q:** Two follow-ups from the hq_* dashboard-sync replacement (see
Answered, below) need action outside Product -- flagging here for GM to
relay rather than editing those departments' files directly. (1)
Infrastructure needs to provision a real value for
`HQ_DASHBOARD_GITHUB_TOKEN` in `.env.local` -- a GitHub token scoped
read-only to this repo's contents on the `work` branch, deliberately
separate from `.env.ops.local`'s push-capable `GH_TOKEN`. (2) The GM's
own write step (`.claude/agents/gm.md` and `hq/gm/charter.md`) needs
updating to commit `hq/_shared/dashboard.json` each run per the contract
in `hq/_shared/dashboard-schema.md`, replacing its old Supabase
DELETE+INSERT sync -- until that lands, `/admin/hq` keeps reading the
placeholder seed. **Recommendation:** no action needed from Matthew
directly; routing this to Infrastructure and GM is the ask. (2026-10-24)

**Q:** Follow-ups from the hq_questions two-way-sync write path (see
Answered, below) -- flagging here rather than editing another
department's files directly. (1) Infrastructure needs to provision a
real value for `HQ_DASHBOARD_GITHUB_WRITE_TOKEN` -- a GitHub token with
write access to this repo's contents, deliberately separate from both
the existing read-only `HQ_DASHBOARD_GITHUB_TOKEN` and the ops-only
`GH_TOKEN`. Until it's set, answering a question from `/admin/hq` fails
with a clear error instead of doing nothing silently. (2) Something
(each department's own run, or the GM centrally, since it already reads
every department's `questions.md` every run) needs to read
`hq/_shared/pending-answers.json` early in its check-in and fold any
staged answer back into that department's own `questions.md` (Open →
Answered, same as when Matthew answers in chat today), then clear the
consumed entry. Full contract in `hq/_shared/pending-answers-schema.md`.
**Recommendation:** no action needed from Matthew directly; route (1) to
Infrastructure and (2) to the GM (centralizing it there avoids editing
every department's own charter/agent file to add the same step).
(2026-10-25)

## Answered

**Q:** Multiple department agents (Product, GM, and apparently others)
share the one `street-work` working directory with no isolation between
runs, causing real collisions (a GM commit landing on whatever branch
Product had checked out; stale `.git/*.lock` files blocking the next
run). **A:** Fixed directly by Matthew (2026-10-25, commit `536c7b6`):
every department now gets its own `git worktree` under `.worktrees/<dept>/`
against the same `.git`, so branching/building/committing in one
department's run can no longer flip the checked-out branch out from under
another. This run is itself running from `.worktrees/product/` as a
result. No further action needed from Product.

**Q:** Replace the hq_* Supabase mirror/sync that feeds `/admin/hq` with
something that doesn't need a separate database write step (GM's
DELETE+INSERT sync kept hanging on an unanswered destructive-operation
confirmation). **A:** Shipped on `agent/hq-office-page-v2` (commit
154c92c8, merged with latest `work`, pushed, PR #49 updated).
`/admin/hq` now reads `hq/_shared/dashboard.json` live off the GitHub
Contents API (`lib/hq-dashboard-source.ts`, gated on a new read-only
`HQ_DASHBOARD_GITHUB_TOKEN` env var, deliberately separate from the
ops-only push-capable `GH_TOKEN`) instead of querying the `hq_*` tables;
`lib/admin-hq.ts` parses that file into the same typed shape the pages
already consume, so no page changed its data-fetching calls. Contract
documented in `hq/_shared/dashboard-schema.md`. QA review (2026-10-24):
approved `lib/hq-dashboard-source.ts`, `lib/admin-hq.ts`, the schema doc,
and the page banner changes with no blocking issues on first pass; sent
this entry itself back once for an inaccurate claim in an earlier draft
(it had described the Infra/GM follow-ups below as already "filed" in
those departments' own files, which hadn't happened) -- that claim is
removed and the entry now only states what actually shipped. Does not touch
`supabase/migrations/20261023_hq_tables.sql` or drop the `hq_*` tables
(Tier 3, needs Matthew) -- unused in place until you say otherwise. Two
things still need someone else before this is fully live -- flagged here
rather than written directly into those departments' own files (not
Product's to touch): Infrastructure needs to provision the actual
`HQ_DASHBOARD_GITHUB_TOKEN` value (read-only, scoped to just this repo's
contents on `work`); the GM's own write step (`.claude/agents/gm.md`/
charter) needs updating to actually commit `hq/_shared/dashboard.json`
each run instead of the old Supabase sync. Until that lands, the page
reads the placeholder seed committed alongside this code. (2026-10-24)

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
