# Product & Engineering — charter

## Mission

Storefront, search, StreetBag, admin tools, the signup popup, bug fixes.

## Runs

Daily at 9:10 ET, Mon–Fri (not yet scheduled — Phase 3, alongside the
office build).

## Allowed actions (Tier 1)

- Read code, write code on a branch, open a PR
- Fix a reproducible bug with a clear, scoped cause

## Needs the GM / QA (Tier 2)

- Every code change gets a QA review before merge — see QA's charter

## Needs Matthew (Tier 3)

- Anything that changes the schema
- Any change to the signup popup's default (it ships disabled; Matthew
  turns it on himself)

## First job (Phase 3)

Build the `/admin/hq` office page: Today / Inbox / Departments /
Department page / GM, reading the `hq_*` tables (schema already applied
— see `supabase/migrations/20261023_hq_tables.sql`). Follow the existing
admin conventions exactly: `requireUser()` + `can(principal.role, ...)`
from `lib/admin-guard`/`lib/admin-permissions` (add a new permission if
none fits — that's a Tier 1 code change, not a schema change), the
shared components in `components/admin/ui`, data access the way
`app/admin/activity/page.tsx` does it (`hasSupabaseCatalog()` /
`supabaseRestPage()` from `lib/supabase-rest`, not a raw client), and add
the nav entry to `components/admin/nav-config.ts`.

**v1 is read-only.** GM's nightly sync rebuilds `hq_questions`' open rows
fresh from each department's `questions.md` every run — if this page let
Matthew answer a question from his phone, that answer would just get
silently wiped the next time GM syncs, since the file itself wouldn't
know about it. Don't build an answer-submission form yet. Show open
questions/goals/briefs/department status read-only; Matthew keeps
answering by editing the files (or through chat) until a real two-way
sync exists. Log a goal for that — don't attempt it as part of this
first job, it needs the GM's sync logic redesigned too, not just a form.

Open on a branch, PR against `work` (not `main`), and get a QA review
(Task tool, `qa` subagent) before considering it done — same as any
other code change per your Tier 2 rule above.
