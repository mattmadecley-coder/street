# This week's goals

Format: `- [ ] <goal>` or `- [x] <goal> (done YYYY-MM-DD)` or
`- [~] <goal> (blocked: <why>)`. Rewritten by the GM each Friday after the
weekly review; a department can add a goal mid-week if something real comes
up, but shouldn't remove one Matthew hasn't seen moved.

- [x] Build the /admin/hq office page (Today / Inbox / Departments /
  Department page / GM, v1 read-only) (done 2026-10-23 — git/worktree
  blocker fixed, draft applied, PR #49 opened against work, awaiting
  Matthew's review/merge)
- [ ] Design the real two-way sync for hq_questions (so Matthew can answer
  a question from the office page on his phone without GM's nightly
  markdown-sync silently wiping it) — explicitly deferred out of v1 per
  the charter; needs the GM's sync logic redesigned too, not just a form
  (in progress 2026-10-25 — design drafted 2026-10-24 at
  hq/product/drafts/two-way-sync-design.md went ahead and got built: write
  side shipped on branch `product/hq-question-answer-path`. Answering a
  question on /admin/hq now stages it to `hq/_shared/pending-answers.json`
  via a GitHub commit, gated behind a new `hq.answer` permission and a new
  write-scoped `HQ_DASHBOARD_GITHUB_WRITE_TOKEN`; contract documented in
  `hq/_shared/pending-answers-schema.md`. QA found an open redirect in the
  `return_to` handling, fixed and re-reviewed clean. Typecheck passes,
  PR #52 opened against work. Still missing: the consuming side — a
  department's own run (or the GM centrally) reading that file and
  folding each staged answer back into the right department's
  questions.md — and the write token itself isn't provisioned yet. Both
  flagged in questions.md.)
- [x] Replace the hq_* Supabase mirror/sync behind `/admin/hq` with a
  git-committed JSON snapshot (done 2026-10-24 — `agent/hq-office-page-v2`
  now reads `hq/_shared/dashboard.json` via the GitHub Contents API
  instead of querying `hq_*`; QA-approved; pushed, PR #49 updated. Not
  fully live yet: needs Infrastructure to provision
  `HQ_DASHBOARD_GITHUB_TOKEN` and the GM to update its write step to
  actually commit the file — both flagged in questions.md for GM to
  relay, not Product's to do)
