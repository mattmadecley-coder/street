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
  (in progress 2026-10-25 — write side shipped on branch
  `product/hq-question-answer-path`, in QA review: answering a question on
  /admin/hq now stages it to `hq/_shared/pending-answers.json` via a
  GitHub commit, gated behind a new `hq.answer` permission and a new
  write-scoped `HQ_DASHBOARD_GITHUB_WRITE_TOKEN`; contract documented in
  `hq/_shared/pending-answers-schema.md`. Still missing: the consuming
  side — a department's own run (or the GM centrally) reading that file
  and folding each staged answer back into the right department's
  questions.md — and the write token itself isn't provisioned yet.
  Flagged in questions.md.)
