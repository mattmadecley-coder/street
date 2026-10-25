# `hq/_shared/pending-answers.json` — contract

The write side of the real two-way sync for `hq_questions` (the goal logged
in `hq/product/goals.md`: let Matthew answer a question from `/admin/hq` on
his phone without the GM's dashboard rebuild silently wiping it).

## Why this file exists instead of editing questions.md directly

`hq/_shared/dashboard.json` is rebuilt from scratch every GM run, straight
from each department's markdown -- it is a derived view, not the source of
truth, so writing an answer into it would just get overwritten. The actual
source of truth is each department's own `hq/<dept>/questions.md`, and that
file's format varies department to department (`**Q:**`, `**Q1 (date):**`,
plain bullets -- see `hq/_shared/dashboard-schema.md`'s notes). Locating and
rewriting the right lines there is a reading-comprehension job, the same
judgment call each department's own agent already makes when Matthew
answers in chat; a deterministic Next.js write path has no safe way to do
that itself without risking corrupting a department's file.

So `/admin/hq` (`lib/hq-pending-answers.ts`, `app/admin/hq/actions.ts`)
writes here instead -- one small, fixed-shape file it fully owns the format
of -- and a department's own run reconciles a staged answer into its own
questions.md using the same judgment it already applies today.

## Shape

```jsonc
{
  "answers": [
    {
      "department": "infrastructure",
      "question_id": "infrastructure:3f9a0c1d2e4b",   // see "Question IDs" below
      "question": "The exact question text as it appears in that department's questions.md.",
      "answer": "Matthew's answer text.",
      "answered_by": "matt@... (or 'shared password')",
      "answered_at": "2026-10-25T14:00:00Z"
    }
  ]
}
```

## Question IDs

A question has no stable ID of its own in markdown, and positional
IDs break the moment a question above it is answered or removed. Instead,
`question_id` is `${department}:${sha256(question_text).slice(0, 12)}` --
computed identically by the read side (`lib/admin-hq.ts`, via
`lib/hq-question-id.ts`) and the write side (`lib/hq-pending-answers.ts`),
so an answer submitted against the question shown on `/admin/hq` always
points at the right one. If the question text in `questions.md` doesn't
match byte-for-byte (the GM paraphrased it while filing `dashboard.json`,
for instance), the hash won't match either -- the consuming side should
treat a `question_id` with no exact text match in that department's
`questions.md` as unresolved and leave it pending rather than guessing.

## What still needs wiring (not done by this write path alone)

Each department's own run needs one new step, early in its check-in,
*before* it reads `questions.md` for anything else: read
`hq/_shared/pending-answers.json`, and for any entry whose `department`
matches its own id, find that exact question text in its own
`questions.md` and move it from Open to Answered with the given `answer`
text (same as it already does today when Matthew answers in chat), then
remove that entry from `pending-answers.json` (it already commits `hq/`
changes every run, so this is one more file in that same commit). Left to
each department to decide whether to do this itself or have the GM do it
centrally on their behalf, since the GM already reads every department's
`questions.md` every run for the daily brief.

Until that lands, a submitted answer sits in this file, visible but not yet
folded back into the department's own file -- same "safe to ship
incrementally" posture as `dashboard.json` had before the GM's write step
existed.

## Requires

- `HQ_DASHBOARD_GITHUB_WRITE_TOKEN` -- a GitHub token with **write** access
  to this repo's contents, scoped to the `work` branch if the token type
  allows it. Deliberately separate from `HQ_DASHBOARD_GITHUB_TOKEN` (read-only,
  used by `/admin/hq` to render) and from `.env.ops.local`'s `GH_TOKEN`
  (push-capable, ops-only). Without it, submitting an answer fails with a
  clear error instead of doing nothing silently.
- Gated behind the `hq.answer` admin permission (owner/admin only, same as
  `hq.view`).
