# Design draft: two-way sync for hq_questions (Matthew answers from `/admin/hq`)

Status: draft, not built. Routed to questions.md for a direction call before
Product builds anything -- see charter's Tier 3 rule and the "First job"
note this was explicitly deferred from.

## The problem

`hq/_shared/dashboard.json` (the thing `/admin/hq` reads) is rebuilt fresh
by the GM every run from each department's `questions.md`/`goals.md`/etc
(see `hq/_shared/dashboard-schema.md`). If the office page let Matthew type
an answer and write it straight into `dashboard.json`, the GM's next run
would silently overwrite it, because the GM doesn't know that answer
exists -- it only reads the markdown files, which never changed.

So any real answer-submission path has to end up back in the department's
actual `questions.md` (the real source of truth), not just in the JSON
snapshot.

## Option A -- app commits directly to the department's questions.md

The office page writes straight to `hq/<dept>/questions.md` via the GitHub
Contents API (same mechanism `lib/hq-dashboard-source.ts` already uses to
read), moving the matched question from Open to Answered in the same
`**Q:** ... **A:** ... (date)` shape departments already use.

Rejected for v2, two reasons:
- **Format risk.** `dashboard-schema.md` already notes that question
  formatting varies department to department (`**Q:**`, `**Q1 (date):**`,
  plain dashes) and that extracting structure from it is "a
  reading-comprehension task, not something a regex script should
  attempt." A web request handler doing a mechanical find-and-replace on
  freeform markdown is exactly the regex-script case that note warns
  against -- it will mis-match text in some department's file eventually.
- **Collision risk.** Departments (including the GM) commit to `work`
  throughout the day. A web request racing a department's own commit to
  the same file has no natural conflict resolution beyond retrying on a
  GitHub `sha` mismatch, and a bad retry (stale re-read) could silently
  drop either side's edit.

## Option B -- pending-answers overlay, applied by the GM each run (recommended)

Keep the web app's write surface to one tiny, mechanical, append-only
file instead of freeform markdown:

1. New file: `hq/_shared/pending-answers.json` -- a flat array:
   ```jsonc
   [
     { "department": "product", "question_key": "product:question:1",
       "answer": "Matthew's typed text", "submitted_at": "2026-10-24T22:10:00Z" }
   ]
   ```
   `question_key` reuses the same stable key `lib/admin-hq.ts` already
   synthesizes for React (`${department}:kind:${index}`) -- no new ID
   scheme needed on the read side.
2. The office page's answer form appends one entry to this array via the
   GitHub Contents API, using a new write-scoped token (see Credentials,
   below). That's the entire app-side write path -- one file, one shape,
   no markdown parsing in app code.
3. The GM's run gets a new **first** step, before its existing
   read-and-summarize work: read `pending-answers.json`; for each entry,
   find that question in the named department's `questions.md` (the GM
   is already doing this exact kind of judgment-call markdown editing for
   every department's file, every run -- same skill, not a new one) and
   move it to Answered with Matthew's text; then clear the file (empty
   array) in the same commit. Only after that does the GM rebuild
   `dashboard.json` from the now-updated markdown, same as today.
4. Until the GM's next run consumes it, the office page shows the
   question as "answered -- applying on GM's next run" by cross-
   referencing `pending-answers.json` against the still-"open" entry in
   `dashboard.json`, rather than claiming it's fully answered immediately.

This keeps the hard part (freeform-markdown judgment) where it already
lives -- with the GM, who reads these files every run anyway -- and gives
the app only a dumb, structured, append-only write.

## Credentials needed (Infrastructure, once a direction is picked)

A new write-scoped GitHub token, e.g. `HQ_ANSWER_GITHUB_TOKEN` --
deliberately separate from both `GH_TOKEN` (ops-only, push rights, used
for deploys) and `HQ_DASHBOARD_GITHUB_TOKEN` (read-only, already in use
for the dashboard read). It needs write access to this repo to commit one
file; there's no GitHub token scope narrower than repo-contents, so the
mitigation is keeping the app-side handler that uses it to one small,
auditable function that only ever writes `pending-answers.json`, never
anything else.

## What still needs a decision before Product builds this

- Direction: Option B above, or something else Matthew/GM prefers.
- This touches the GM's own `.claude/agents/gm.md` / `hq/gm/charter.md`
  (Product doesn't edit other departments' files) -- needs the GM to pick
  this up as its own work once the direction is blessed.
- A new credential (Infrastructure's to provision) and a new write
  capability -- the app committing to the repo on Matthew's behalf for
  the first time, where today it only ever reads. Flagging for an
  explicit go-ahead rather than treating it as routine Tier 1, same as
  the original "First job" note called for.
