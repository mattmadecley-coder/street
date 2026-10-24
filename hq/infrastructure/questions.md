# Questions for Matthew

## Assigned by Matthew

- 2026-10-23: Set up separate git worktrees (or standalone clones) per
  department so department agents stop sharing one checked-out working
  directory -- this is what caused today's branch-collision and stale
  `.git/*.lock` incidents (see Product's questions.md for the detail).
  Matthew has approved doing this; decide worktree vs. clone and roll it
  out for all departments. (assigned by Matthew, chat)
  - 2026-10-24 update: still open. Looked at what it'd take this run and
    hit a scope blocker worth flagging: from inside this agent's own
    sandbox, I only ever see the one folder connected to *my* scheduled
    task (`street-work`) -- I have no way to create sibling worktree
    folders next to it, and no visibility into (or ability to edit)
    other departments' scheduled-task configs to point them at new
    worktree paths. Rolling this out for "all departments" isn't just a
    repo change -- each department's scheduled task also needs its
    connected folder repointed at its own worktree, which only Matthew
    (via the desktop app) or the GM can do. Recommend: I (or the GM)
    propose a concrete worktree-per-department path layout under
    `C:\Users\mattm\Documents\street-work-<dept>\`, then Matthew
    adds/repoints each department's connected folder accordingly. Left
    as still open/unassigned rather than guessing at a layout no one's
    reviewed.

- 2026-10-24: Go ahead and look into the DB connection-pool-exhaustion
  issue (the 120+ "Timed out acquiring connection from connection pool"
  errors) -- Matthew approved investigating and fixing this, not just
  flagging it. Check real Postgres `max_connections` / PostgREST
  `db-pool`/`db-pool-timeout` settings against actual concurrent load
  (Adminer/SSH), and whether staggering the cron jobs further apart
  would help on the 3.8GB VPS. Per charter, fixing a config issue on a
  branch and opening a PR is already Tier 1 for you -- actually
  deploying it to production still needs Matthew's sign-off, same as
  always. (assigned by Matthew, chat)

- 2026-10-24: Matthew doesn't know what the cron watchdog is or does --
  look into `authorize_cron_watchdog` (the missing Postgres function
  behind the storefront-health/catalog watchdog auth failures) and
  explain in plain terms what it's for and what breaks without it,
  alongside drafting the migration to add/expose it. Applying a DB
  migration is still Tier 3 -- draft it and ask Matthew to approve
  applying it, don't apply it yourself. (assigned by Matthew, chat)

## Open

- **Repeated DB connection-pool-exhaustion errors in the live app logs
  (not the known Traefik 503 pattern).** Pulled the last 2000 lines of
  the Coolify app container log today (2026-10-24) and found 120+
  occurrences of `Timed out acquiring connection from connection pool.`
  across `Street database catalog read failed`, `Street paged catalog
  read failed`, `Street related products read failed`,
  `Street single-product lookup failed`, and `Street brand lookup
  failed` -- plus a few `canceling statement due to statement timeout`.
  This is distinct from the documented Traefik-under-load 503 pattern in
  the charter: those are routing-layer blips that resolve on retry; this
  is the app's own DB calls failing to get a connection at all. The app
  code (`lib/catalog-store.ts` etc.) catches these and returns `null`/
  empty rather than a hard 500, so it won't show up as a classic 5xx
  spike in a point-in-time curl check (home page is still 200) -- but it
  means catalog/product/brand lookups are silently failing and probably
  serving empty or degraded pages to real visitors some fraction of the
  time. Root cause looks infra-level: the self-hosted Postgres/PostgREST
  pool size vs. concurrent load (site traffic plus the classify/catalog
  cron jobs hitting the DB at the same time), compounded by the VPS
  being memory-constrained (2 vCPU/3.8GB) -- not something fixable in
  this repo's application code alone, and not something I should size
  unilaterally given the memory tradeoff. Recommend: someone with VPS
  access check the Postgres `max_connections` and PostgREST `db-pool`/
  `db-pool-timeout` settings against actual concurrent load, and
  consider staggering the cron jobs further apart if raising the pool
  isn't safe on 3.8GB. Did not attempt a code-level mitigation (e.g.
  adding retry/backoff on this specific error the way the cron workflow
  already retries Traefik 503s) because that touches shared
  catalog-rendering code other departments depend on and could make
  pool pressure worse, not better, without knowing real headroom first.
  (2026-10-24)

- **Storefront-health cron's watchdog can't authorize -- missing
  Postgres function.** Same log pull turned up one occurrence of
  `Street storefront-health watchdog authorization failed Error: Could
  not find the function public.authorize_cron_watchdog(p_job_key,
  p_token) in the schema cache`. The GitHub Actions run for
  `storefront-health` still reports success (the HTTP call to
  `/api/cron/storefront-health` returned fine), but this suggests the
  watchdog's own authorization check inside that job is silently
  failing against the database -- the function it's calling doesn't
  exist (or isn't exposed in PostgREST's schema cache). This needs a
  database migration to add/expose `authorize_cron_watchdog`, which is
  explicitly Tier 3 for this department -- flagging rather than
  touching it. Checked further: `app/api/cron/catalog/route.ts` and
  `app/api/cron/storefront-health/route.ts` both call
  `rpc/authorize_cron_watchdog`, but a search of `supabase/migrations/`
  turns up no migration that ever creates
  `public.authorize_cron_watchdog` -- looks like the app code shipped
  ahead of a migration that was never written (or was written and
  never applied to this self-hosted instance). The `catalog` cron job
  calls the same RPC and its GitHub Actions run also reported success
  today, so this may be failing there too, just not logged as a
  distinct "watchdog authorization failed" line the way
  storefront-health's is. Needs a migration adding that function (and
  confirming it's applied and exposed in PostgREST's schema cache).
  (2026-10-24)

## Answered

**Q:** `gh auth status` returns "invalid token" during scheduled/chat
runs even though Matthew is logged in via `gh` on the same machine.
**A:** Root cause was never a credential mismatch -- every run executes
in its own fresh, isolated Linux sandbox that only has the mounted
`street-work` folder; it never sees Matthew's Windows `gh` install,
PATH, or Credential Manager, and a one-off headless sandbox can't
complete `gh auth login`'s interactive flow anyway. Fix: Matthew
generated a fine-grained GitHub PAT for `mattmadecley-coder/street`
(Contents, Pull requests: read/write; Actions: read) and added it to
`.env.ops.local` as `GH_TOKEN=...`. Verified end-to-end live in chat
2026-10-24: `curl` with the token against the GitHub API returns the
repo with push permission; `git push` using the token as an inline
`x-access-token` credential successfully pushed the three commits that
had been stuck local-only on `work`; `gh` has no apt/root access in
this sandbox (`apt-get`/`sudo` both fail -- not a root user), so it has
to be fetched as a standalone binary instead (download the matching
`gh_<version>_linux_amd64.tar.gz` from
`https://api.github.com/repos/cli/cli/releases/latest`, extract, and
put `gh` on `PATH` -- it isn't installed persistently, so this is a
per-run step); once `GH_TOKEN` is exported, `gh auth status`, `gh pr
list`, and `gh run list` all worked and correctly showed PR #49 and a
clean GitHub Actions cron history. (2026-10-24)

**Q:** This agent runs from the `street-work` worktree, which has no
`.env.ops.local`, so Coolify's URL/token couldn't be read.
**A:** Confirmed and fixed — copied `.env.ops.local` from
`C:\Users\mattm\Documents\street` into `street-work` directly on the
machine (it's gitignored in both places, so this never touches git).
Coolify health checks should work on the next run. (2026-10-23)

Format once answered: move the question under here with
`**Q:** ... **A:** ... (YYYY-MM-DD)`.
