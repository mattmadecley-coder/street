# This week's goals

Format: `- [ ] <goal>` or `- [x] <goal> (done YYYY-MM-DD)` or
`- [~] <goal> (blocked: <why>)`. Rewritten by the GM each Friday after the
weekly review; a department can add a goal mid-week if something real comes
up, but shouldn't remove one Matthew hasn't seen moved.

- [~] Build the /admin/hq office page (Today / Inbox / Departments /
  Department page / GM, v1 read-only) (blocked: street-work's git worktree
  can't be used from this agent's sandbox at all -- see questions.md. Full
  implementation is drafted and ready in hq/product/drafts/office-page/;
  just needs a branch + QA + PR once that's fixed)
- [ ] Design the real two-way sync for hq_questions (so Matthew can answer
  a question from the office page on his phone without GM's nightly
  markdown-sync silently wiping it) -- explicitly deferred out of v1 per
  the charter; needs the GM's sync logic redesigned too, not just a form
