# Questions for Matthew

## Open

**Q:** Drafted the design for the two-way sync on `hq_questions` (the item
deferred out of the `/admin/hq` v1 build) -- full writeup at
`hq/product/drafts/two-way-sync-design.md`. Short version: don't have the
web app write freeform markdown directly (format varies department to
department, and it'd race departments' own commits to the same file);
instead give the app one tiny append-only file
(`hq/_shared/pending-answers.json`) to write Matthew's answers into, and
have the GM consume that file as the first step of its existing run
(moving each answer into the real `questions.md`, same judgment-call
editing it already does) before rebuilding `dashboard.json`. This needs a
direction call before Product builds anything: it touches the GM's own
agent/charter (not Product's to edit) and needs a new write-scoped GitHub
credential from Infrastructure (the app would gain write access to the
repo for the first time, today it only reads). **Recommendation:** approve
the Option B approach in the draft (or send back with a different
direction), then GM picks up its side and Infrastructure provisions the
token; Product builds the office-page form once both are ready.
(2026-10-24)

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

**Task:** Sitemap only lists a fraction of products -- fix it. GM verified
live: `app/sitemap.ts` hard-caps product URLs at `MAX_PRODUCT_URLS = 5000`,
but there are 13,591 active, non-hidden products in the DB
(`is_active=eq.true&is_hidden=eq.false`), and the live sitemap at
`https://streetdotcom.com/sitemap.xml` currently had 5086 `<url>` entries
total (the 5000 cap plus ~86 static/brand routes) -- roughly 8,500 products
(63%) were missing. **A:** Fixed on branch `product/sitemap-generate-sitemaps`,
PR #53 against `work`. `app/products/sitemap.ts` (new) uses Next's
`generateSitemaps()` to chunk every eligible product across
`/products/sitemap/0.xml`, `/products/sitemap/1.xml`, etc. (10k/chunk, under
Google's 50k-per-file limit, scales automatically as the catalog grows).
`app/sitemap.ts` now returns only the static + brand routes. `app/robots.ts`
lists every product-sitemap chunk URL explicitly, since this Next.js
version's `generateSitemaps()` does not auto-generate a combined index
file linking the chunks back to `/sitemap.xml` (confirmed against the
actual installed Next 16.2.10 docs/types in `node_modules/next`, including
the v16 breaking change that the sitemap function's `id` param is now a
promise). QA-approved; one non-blocking follow-up QA flagged for later --
`getAllProductSitemapEntries()`'s `order=last_synced_at.desc` has no
secondary tiebreaker, so if two products share an identical timestamp and
the fetch cache expires between chunk requests, a product could in theory
shift between chunk files on the next crawl (every product stays counted
and included somewhere, so this doesn't resurrect the original bug).
Awaiting Matthew's review/merge of PR #53. (2026-10-26)

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
