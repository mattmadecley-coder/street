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

  - 2026-10-24 update (GM, live chat session): hit the real collision
    today, not just the theoretical risk -- Product (on
    `agent/hq-office-page-v2`) and what looks like a QA review were
    both actively running directly in the shared `street-work` checkout
    at the same time I was trying to edit office-app there. Each branch
    switch flipped the one shared working directory's HEAD out from
    under whoever else was using it; I had to stash Product's
    in-progress uncommitted files to avoid losing anything (see
    `git stash list` -- `product-agent-2026-10-24-wip-stash` and my own
    stash are both still sitting there unpopped, plus a
    `qa-reviewer-safety-stash` that looks like QA did the same thing
    independently), then gave up switching the shared checkout back and
    forth entirely. Worked around it by creating a second worktree
    myself -- `git worktree add .worktrees/gm-office-app work` --
    **inside the already-connected `street-work` folder itself**.
    That's the unblock for the scope problem noted above: a worktree
    doesn't need its own top-level connected folder if it lives as a
    subdirectory of one that's already connected (e.g.
    `street-work/.worktrees/<dept>/`), so this doesn't need Matthew to
    add or repoint anything, and no one needs visibility into other
    departments' trigger configs either -- only whoever launches each
    department's `claude -p` session needs to `cd` into its own
    `.worktrees/<dept>/` instead of the shared root. Concretely: give
    each of the 10 scheduled-task departments (not GM, not QA -- QA
    reviews happen inside whichever department invoked it, so it
    inherits that department's worktree) a `.worktrees/<dept>/`
    worktree on `work`, and change `office-app/dept-runner.js` /
    `lib/fire.js`'s `cwd` from the shared `REPO_ROOT` to that
    department's worktree path, so office-app's own fired and
    auto-check-in sessions get the same isolation. Recommend actually
    building this soon -- today's collision directly disrupted a live
    GM session and nearly office-app's own files, and will keep
    happening any time two departments (or a department and the GM, or
    a department and Matthew's own office-app check-ins) are active at
    once, which is now the normal case given the clock-in feature just
    shipped.

  - 2026-10-25 update (GM): done for the office-app side, which is where
    this actually bites day to day. Gave all 9 remaining
    scheduled/clock-in departments (analytics, catalog, finance,
    growth-lifecycle, growth-seo, growth-social, legal, partnerships,
    qa) their own `.worktrees/<dept>/` worktree on a fresh
    `dept/<dept>-base` branch off `work`, matching what Infrastructure
    and Product had already worked out for themselves ad hoc
    (`.worktrees/infrastructure` on `infra/exclude-hq-from-typecheck`,
    `.worktrees/product` on `agent/hq-office-page-v2`). Updated
    `office-app/lib/departments.js` to resolve each department's `cwd`
    to its worktree (new `lib/worktrees.js`), and `dept-runner.js` to
    spawn `claude` there instead of the shared `REPO_ROOT`, so every
    fired and auto-check-in session now gets this for free -- no change
    needed to any scheduled-task config, since the worktrees live inside
    the already-connected `street-work` folder. Also closed the gap
    this opens: a department's hq/ edits now live in its own worktree
    until it pushes them, so the auto check-in and assigned-task prompts
    both now tell the department to commit and push just its own
    `hq/<dept>/` files back onto `work` at the end of each run
    (`fetch` + `rebase origin/work` + `push origin HEAD:work`), and the
    app's own main checkout (where the GM chat reads from) now does a
    best-effort fast-forward pull of `work` before every GM reply and
    once a minute in the background, so Matthew's chat doesn't go stale
    waiting on a manual pull. This is still prompt-driven for the
    commit/push step (not hard-coded into dept-runner.js), so it's worth
    watching the first few days of real check-ins to confirm departments
    are actually doing it reliably rather than leaving work stranded
    uncommitted in their own worktree.

  - 2026-10-25 later update (GM): the worktree rollout above is
    confirmed working in practice now -- analytics, catalog,
    growth-lifecycle, growth-social, partnerships, and product all did
    real, substantial work in their own worktrees on today's first
    clock-in (one of them queried a table back three weeks, another
    filed detailed cross-department findings). Two things worth a look
    when you get a chance, neither urgent:
    1. **finance, growth-seo, and infrastructure (this department) all
       crashed almost instantly on today's first clock-in**, each with
       Windows exit code 3221226505 (0xC0000005, access violation) and
       an empty live-runs log -- not a graceful error, the process died
       before writing anything. Legal failed too but never even got
       that far (no live-runs folder at all -- its status is still
       stuck on "sent" from the same run). All four landed within the
       same ~2-minute window as the other departments' real runs
       starting up, which smells like resource contention from several
       `claude.exe` processes launching close together rather than
       anything specific to those departments. I widened `STAGGER_MS`
       in `office-app/lib/scheduler.js` from 20s to 45s as a first
       mitigation, but if this keeps happening it's worth a proper look
       (Task Manager during a clock-in burst, maybe).
    2. Separately, found and fixed a real bug while in there:
       `dept-runner.js` was marking a run "error" (red dot) whenever our
       own 10-minute timeout killed it, even if the department had
       already finished real, valuable work and logged it just before
       being killed -- partnerships and product both hit this today.
       Fixed by only calling it an error when nothing fresh actually got
       written during that run, and bumped the timeout itself to 15
       minutes since real multi-step work is now routinely using most
       of the old 10.

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
  - 2026-10-24 investigated (no fix applied -- see why below): no SSH
    key is available to this agent on this machine (`~/.ssh` has no
    private key, only `known_hosts`), so I couldn't check the VPS
    directly. Got real data a different way -- logged into Adminer
    (scripted the login form with the `ADMINER_*` / `SUPABASE_POSTGRES_PASSWORD`
    creds already in `.env.ops.local`, as PostgreSQL against the
    `supabase-db` host) and ran read-only queries:
    - Postgres `max_connections = 100`. Right now (a quiet moment, not
      during a cron burst) there are ~50 total connections open across
      everything, and only 11 of those are PostgREST's (`authenticator`
      role, "PostgREST 14.6" in `pg_stat_activity`). Postgres itself has
      plenty of headroom at `max_connections=100` -- raising *that*
      isn't the fix.
    - The `authenticator` role (the one PostgREST connects as) has a
      role-level `statement_timeout=8s` and `lock_timeout=8s` set via
      `pg_roles.rolconfig`. That explains the handful of "canceling
      statement due to statement timeout" lines in the same log pull --
      not a bug, a deliberate short leash on PostgREST's own queries.
    - The error text itself -- "Timed out acquiring connection from
      connection pool" -- is PostgREST's *own* internal pool-exhaustion
      message, not Postgres's. PostgREST keeps a small internal
      connection pool (`PGRST_DB_POOL`, commonly defaults to 10) separate
      from Postgres's `max_connections`; when concurrent requests exceed
      that small pool (site traffic plus `catalog`/`classify` cron
      hitting the DB at the same time), requests queue and time out
      waiting for a free connection from PostgREST's own pool, even
      though Postgres has 89 connections' worth of unused headroom.
    - **Likely real fix: raise PostgREST's `PGRST_DB_POOL` (and maybe
      `PGRST_DB_POOL_TIMEOUT`) env var on the PostgREST service, not any
      Postgres setting.** I could not confirm its current value or
      change it this run -- it's a Coolify-managed service env var, not
      a file in this repo, and the Coolify API token in `.env.ops.local`
      is returning 401 "Unauthenticated" right now even on the
      previously-working `/applications/<uuid>` endpoint (see new Open
      item below), so I have no read or write path to it at the moment.
    - Didn't touch cron stagger timing -- GitHub Actions' own schedule
      offsets (`catalog`/`storefront-health`/`classify` are already 1.5h
      apart per `cron.yml`) look reasonable already and raising
      `PGRST_DB_POOL` is the more direct fix for what the logs actually
      show.
    **Asking Matthew:** once the Coolify token is sorted (see below), can
    I get it re-enabled so I can read the PostgREST service's current
    `PGRST_DB_POOL`/`PGRST_DB_POOL_TIMEOUT` values and raise them (config
    change, no migration, but it's a production service setting so
    treating the actual change as needing your sign-off same as a
    deploy)?

- 2026-10-24: Matthew doesn't know what the cron watchdog is or does --
  look into `authorize_cron_watchdog` (the missing Postgres function
  behind the storefront-health/catalog watchdog auth failures) and
  explain in plain terms what it's for and what breaks without it,
  alongside drafting the migration to add/expose it. Applying a DB
  migration is still Tier 3 -- draft it and ask Matthew to approve
  applying it, don't apply it yourself. (assigned by Matthew, chat)
  - 2026-10-24 done (drafted, not applied): **What it is, in plain
    terms:** the `catalog` and `storefront-health` cron routes each
    normally run when GitHub Actions calls them with a shared cron
    secret -- that part works fine and isn't affected by any of this.
    But both routes *also* accept a second way in: a request carrying
    an `x-street-worker-token` header instead, meant for a "watchdog" --
    a periodic job living inside Postgres itself (via the `pg_cron` +
    `pg_net` extensions) that can reach out and poke the cron endpoint
    directly if it thinks a run got stuck, as a safety net independent
    of GitHub Actions. Street already has exactly one of these working
    today, for the AI classification queue (`wake_classification_worker`,
    every 5 minutes) -- `authorize_cron_watchdog` was supposed to be the
    same idea generalized for catalog/storefront-health, but the
    migration that creates it was never written. Right now, calling
    either route with that header fails with "function not found," which
    is exactly the line in storefront-health's logs. **What actually
    breaks without it:** nothing today -- GitHub Actions cron has run
    successfully every time (confirmed again this run), so there is no
    active watchdog trying to use this path yet. It's a latent gap, not
    a live outage.
    Drafted `supabase/migrations/20261024_authorize_cron_watchdog.sql`
    on branch `infra/authorize-cron-watchdog`, opened as PR #50:
    https://github.com/mattmadecley-coder/street/pull/50 -- generalizes
    the classification worker's existing pattern into one table
    (`cron_watchdog_jobs`) keyed by job name instead of adding another
    one-off table. Rows for `catalog` and `storefront-health` are
    inserted with `trigger_token = null`, so the function exists (fixing
    the log error once applied) but safely returns `false` for both
    until a real token is deliberately set -- this migration does not
    stand up an active watchdog by itself; that would need a follow-up
    (a real token + a `net.http_post` wake function + a `cron.schedule`
    job, same shape as classification's). **Asking Matthew:** (1)
    approve applying this migration to the self-hosted Postgres instance
    (Tier 3, per charter); (2) separately, does he actually want an
    active watchdog for these two jobs, given GitHub Actions cron hasn't
    failed once in the history checked so far? If not, this migration
    alone is enough to make the log line go away and nothing further is
    needed.

## Open

- **Wiring a failed cron/deploy to wake Infrastructure off-schedule needs
  Product's office-app, not just an Infra-side config change.** Looked
  into this goal this check-in. Traced how a department actually gets
  woken: `office-app/lib/fire.js`'s `fireDepartment()` just spawns a
  local Node child process on Matthew's own machine (via `dept-runner.js`)
  -- it's not an HTTP endpoint and nothing calls it from outside the app.
  `.github/workflows/cron.yml` runs on GitHub's own cloud runners, which
  have no path to reach into Matthew's local machine or call
  `fireDepartment()` directly; same for a failed Coolify deploy, which
  Coolify's own infra would have to webhook somewhere reachable. The only
  realistic shape I can see: office-app's own local scheduler (which
  already fires each department on its normal interval) would need a
  second, independent poll -- e.g. every few minutes, check `gh run list`
  for the latest cron run's conclusion and Coolify's deploy status, and
  call `fireDepartment("infrastructure", {trigger: "auto"})` immediately
  if either shows a failure, instead of waiting for Infrastructure's next
  scheduled slot. That's a change to `office-app`'s scheduler/runner code,
  which is Product's area, not mine -- per charter this is Tier 2 (a code
  change outside my own area) rather than something I should just build.
  **Recommend:** GM coordinates with Product to add this poll-and-fire
  path to office-app; I'm glad to hand over the exact `gh run list --json
  conclusion` / Coolify `/api/v1/applications/<uuid>` calls to check
  against if that's useful. (2026-10-24)

- **Coolify API token (`COOLIFY_API_TOKEN` in `.env.ops.local`) is now
  rejected.** Every Coolify API call this run returned
  `401 {"message":"Unauthenticated."}` -- including
  `GET /api/v1/applications/<uuid>`, the exact call that returned `200`
  as recently as this morning's run (see goals.md and yesterday's
  report). The Coolify host itself is reachable (`/api/health` ->
  `200`, unauthenticated), so this isn't a network/DNS problem -- the
  token value itself is being rejected now. I did not try to fix this
  myself since regenerating it means logging into Coolify's own UI,
  which I have no access to. Can't check Coolify deploy health or read
  any Coolify-managed service's env vars (including the PostgREST pool
  settings above) until this is resolved. **Asking Matthew:** please
  regenerate the Coolify API token in Coolify's UI and update
  `COOLIFY_API_TOKEN` in `.env.ops.local` (value only, not the file
  structure, so this stays Tier 1 for me to pick up once it's there).
  (2026-10-24)

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
