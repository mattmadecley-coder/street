# `hq/_shared/dashboard.json` — contract

What the GM writes each run, in place of the old `hq_*` Supabase sync, and
what `/admin/hq` reads (via `lib/hq-dashboard-source.ts` + `lib/admin-hq.ts`).
GM commits this file to `work` alongside the rest of its `hq/` writes — the
same reliable git push it already does every run, no separate DB write step
to hang on a confirmation prompt.

The markdown files (`log.md`, `questions.md`, `goals.md`, the daily brief)
stay the single source of truth. This file is a derived, rebuilt-fresh-each-run
snapshot of them, same as the old Supabase tables were — just committed
instead of synced over a DB connection.

## Shape

```jsonc
{
  "generated_at": "2026-10-24T19:30:00Z",   // ISO timestamp, when the GM built this

  "departments": [
    { "id": "gm", "display_name": "General Manager", "last_run_at": "2026-10-24T13:35:00Z", "last_status": "ok" }
    // one entry per department id in supabase/migrations/20261023_hq_tables.sql's seed list.
    // last_status is free text (e.g. "ok", "needs_attention", "blocked") -- same convention
    // the old hq_departments.last_status had. statusTone() in lib/admin-hq.ts colors it by
    // keyword match (error/fail/block -> danger, warn/partial -> warn, ok/done/clean -> success).
  ],

  // Keyed by department id. Most-recent-first; GM should cap each department's
  // list at ~30 entries (matches the old hq_logs query limit) rather than let
  // this grow unbounded.
  "logs": {
    "gm": [
      { "ran_at": "2026-10-24T13:35:00Z", "message": "One-line summary, same text as the log.md line." }
    ]
  },

  // Keyed by department id. Include BOTH open and answered questions --
  // the Inbox page filters client-side-of-the-fetch by status, and the
  // department detail page shows an "Answered" section too.
  "questions": {
    "gm": [
      {
        "question": "The question text.",
        "recommendation": "That department's own recommended answer, or null.",
        "status": "open",            // "open" | "answered"
        "answer": null,               // Matthew's answer once status is "answered", else null
        "created_at": "2026-10-24T13:35:00Z",
        "answered_at": null
      }
    ]
  },

  // Keyed by department id. Include every goal regardless of status (open,
  // done, and blocked alike) -- same as the old hq_goals table.
  "goals": {
    "gm": [
      { "goal": "Goal text.", "status": "open", "note": null, "updated_at": "2026-10-24T13:35:00Z" }
      // status: "open" | "done" | "blocked"
    ]
  },

  // The GM's daily briefs, most-recent-first. Cap at ~30 (matches the old
  // hq_briefs query default).
  "briefs": [
    { "brief_date": "2026-10-24", "content": "Full markdown content of that day's brief." }
  ]
}
```

## Notes for whoever updates the GM's write step

- No IDs needed for log/question/goal/brief entries -- the read side
  (`lib/admin-hq.ts`) synthesizes a stable key (`${department}:kind:${index}`)
  for React's benefit. Department `id`s are the real identifiers (used in
  `/admin/hq/departments/[id]` URLs) and must exactly match the ids in
  `supabase/migrations/20261023_hq_tables.sql`'s seed list.
- This is exactly the same information the GM was already computing to do
  the old `hq_*` DELETE+INSERT sync (per its charter's "What the GM writes
  every run" section) -- the change is the destination (one JSON file,
  committed) and the shape (one object instead of five tables), not the
  underlying read-and-summarize work.
- Extracting structured open/answered questions and goals out of each
  department's freeform `questions.md`/`goals.md` is a reading-comprehension
  task (formats vary department to department -- `**Q:**`, `**Q1 (date):**`,
  plain bullet dashes, etc.), not something a regex script should attempt.
  That's exactly the kind of judgment call the GM, as an agent reading those
  files anyway, is already positioned to make -- same as it already does for
  the Supabase sync today.
- If this file is missing or malformed, `/admin/hq` shows its existing
  "hasn't synced yet" empty state -- nothing breaks, it just has nothing to
  show. Safe to ship incrementally (e.g. departments + logs first, questions/
  goals/briefs filled in later) if that's easier than doing it all at once.
- Never put secret values in this file -- same house rule as every other
  `hq/` file.
