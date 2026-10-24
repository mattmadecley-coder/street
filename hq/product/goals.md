# This week's goals

Format: `- [ ] <goal>` or `- [x] <goal> (done YYYY-MM-DD)` or
`- [~] <goal> (blocked: <why>)`. Rewritten by the GM each Friday after the
weekly review; a department can add a goal mid-week if something real comes
up, but shouldn't remove one Matthew hasn't seen moved.

- [x] Build the /admin/hq office page (Today / Inbox / Departments /
  Department page / GM, v1 read-only) (done 2026-10-23 — git/worktree
  blocker fixed, draft applied, PR #49 opened against work, awaiting
  Matthew's review/merge)
- [~] Design the real two-way sync for hq_questions (so Matthew can answer
  a question from the office page on his phone without GM's nightly
  markdown-sync silently wiping it) (blocked: design drafted
  2026-10-24 at hq/product/drafts/two-way-sync-design.md — recommends a
  pending-answers.json overlay the GM consumes each run rather than the
  app writing freeform markdown directly; filed to questions.md for a
  direction call, since it needs the GM's own charter changed and a new
  write-scoped GitHub credential from Infrastructure before Product can
  build the office-page form)
- [x] Replace the hq_* Supabase mirror/sync behind `/admin/hq` with a
  git-committed JSON snapshot (done 2026-10-24 — `agent/hq-office-page-v2`
  now reads `hq/_shared/dashboard.json` via the GitHub Contents API
  instead of querying `hq_*`; QA-approved; pushed, PR #49 updated. Not
  fully live yet: needs Infrastructure to provision
  `HQ_DASHBOARD_GITHUB_TOKEN` and the GM to update its write step to
  actually commit the file — both flagged in questions.md for GM to
  relay, not Product's to do)
