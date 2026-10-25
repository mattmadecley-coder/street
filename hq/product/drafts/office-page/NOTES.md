# Office page (/admin/hq) — ready to apply, blocked on git

Written 2026-10-23 by the Product & Engineering agent. This is the Phase 3
"First job" from hq/product/charter.md: Today / Inbox / Departments /
Department page / GM, read-only, reading the hq_* tables.

## Why this sat in drafts instead of a branch/PR

From this run's sandbox, `street-work` is a git **worktree** whose `.git`
file reads:

    gitdir: C:/Users/mattm/Documents/street/.git/worktrees/street-work

That path is on the *main* `street` checkout, which is a different folder
than the one connected to this session, and -- this is the real,
unfixable-from-here part -- this agent's shell is a sandboxed Linux VM with
no view of the Windows filesystem at all (no drive letters, no `C:/...`,
confirmed no `/mnt/c`). Even if `street` were also connected, a Windows
absolute path like that can never resolve inside this VM. So no `git`
command works at all in `street-work` from this environment: not `status`,
not `log`, not `branch` -- nothing. This is almost certainly the same root
cause Infrastructure's first run hit today with `gh auth status` and a
missing repo URL (see hq/infrastructure/reports/2026-10-23.md) -- the agent
definition file even says "this has happened before ... cause not yet
understood." Now it's understood: it's structural, not a one-off glitch.

I did not try to work around this by hand-editing `.git` internals or
faking a parallel repo -- too easy to corrupt the real history or confuse
a later `git` run on your actual machine. I also didn't write these files
directly into `app/`/`lib/`/`components/` on disk, since without git I'd
have no branch, no diff, and no way to know what's already checked out
there -- that would violate "never commit directly to work or main" in
spirit even without running `git commit`.

**What would actually fix it, your call (flagged in questions.md too):**
make `street-work` a normal standalone clone with its own `.git` and its
own configured remote, instead of a worktree of `street`. A worktree only
works when something can see both folders through one real filesystem --
which is true from a Windows terminal, but not through this bridge.

## What's in this folder

Everything below is finished, reviewed-against-the-codebase-conventions
code, ready to drop into the real tree once git works from here (or you
copy it in yourself):

- `lib/admin-hq.ts` -- new file. Data access for all hq_* tables, same
  shape as `lib/admin-state.ts` (`hasSupabaseCatalog()` /
  `isMissingTableError()` from `lib/supabase-rest` + `lib/admin-state`,
  never a raw client). Exports `OFFICE_TABS` (the shared Today/Inbox/
  Departments/GM tab list) and tone helpers for badges.
- `app/admin/hq/page.tsx` -- **Today**. Stat tiles (departments run today,
  open questions, open goals), latest GM brief, a preview of open
  questions, and the department list with status badges.
- `app/admin/hq/inbox/page.tsx` -- **Inbox**. Every department's questions,
  filterable by open/answered/all (same `searchBar` + GET form pattern as
  `app/admin/activity/page.tsx`).
- `app/admin/hq/departments/page.tsx` -- **Departments**. Full list, same
  row style as the brands "imports in progress" list
  (`.row`/`.rowSummary`/`.rowSummaryStatic`).
- `app/admin/hq/departments/[id]/page.tsx` -- **Department page**. Open +
  answered questions, goals, last 30 runs. 404s via `notFound()` for an
  unknown id once the tables are synced.
- `app/admin/hq/gm/page.tsx` -- **GM**. List of daily briefs, most recent
  one expanded.

All five pages: `requireUser()` then `can(principal.role, "hq.view")`,
redirecting to `/admin/forbidden?needs=hq.view` otherwise -- exactly the
`app/admin/activity/page.tsx` pattern. All data reads use `noStore: true`
(this is small, rarely-changing ops data, not the cached catalog) and
degrade to a `Banner` instead of crashing when the tables aren't there yet
(`isMissingTableError`). **No write path anywhere** -- this is the
charter's explicit v1 scope; a goal for real two-way sync is in goals.md.

I used the shared `Tabs` component from `components/admin/ui` for the
Today/Inbox/Departments/GM sub-nav. It's exported there but not used by
any existing page yet (email/social have their own bespoke `*Tabs`
components predating it) -- this seemed like the right place to start
actually using it, matching "the shared components in
`components/admin/ui`" from the charter, but flagging the choice in case
you'd rather match the older per-section pattern instead.

## Three small edits to existing files (not yet applied, same reason)

**1. `lib/admin-permissions.ts`** -- add a permission gated to owner/admin,
same tier as `audit.view`:

```diff
   "team.manage",
   "audit.view",
+  "hq.view",
 ] as const;
```

```diff
   admin: new Set<Permission>(["view", "catalog.write", "catalog.delete", "homepage.write", "reports.manage", "reports.send", "email.write", "email.send", "analytics.write", "settings.write", "audit.view"]),
+  // -> add "hq.view" to this admin Set too
```

(`owner` already gets everything via `new Set(PERMISSIONS)` -- no change
needed there.)

**2. `components/admin/icons.tsx`** -- add an icon for the nav entry, e.g.:

```ts
  office: <><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M9 21v-4h6v4M8 7h2M8 11h2M8 15h2M14 7h2M14 11h2" /></>,
```

**3. `components/admin/nav-config.ts`** -- add to the "Store" group
(alongside Settings/Team/Activity, same permission tier):

```ts
      { href: "/admin/hq", label: "Office", icon: "office", also: ["/admin/hq/inbox", "/admin/hq/departments", "/admin/hq/gm"], permission: "hq.view" },
```

Optionally also add to `PALETTE_PAGES` (⌘K):

```ts
  { href: "/admin/hq/inbox", label: "HQ: Inbox", hint: "Office" },
  { href: "/admin/hq/departments", label: "HQ: Departments", hint: "Office" },
  { href: "/admin/hq/gm", label: "HQ: GM briefs", hint: "Office" },
```

## Update, second run same day: QA-reviewed and one bug fixed

Cross-checked every file in this folder against the live codebase again
(no drift since it was written) and ran the whole change through an
independent review against `hq/qa/charter.md`. First pass was sent back:
`app/admin/hq/departments/[id]/page.tsx`'s `generateMetadata` called
`loadHqDepartment(id)` with no `requireUser()`/`can(role, "hq.view")`
check, unlike the page body below it and every other page here --
`generateMetadata` runs its own render pass independent of the page
body's redirect, so it could leak a department's `display_name` into
page metadata for an unauthenticated or wrong-role request. Fixed: it now
calls `getPrincipal()` (the existing non-redirecting lookup from
`lib/admin-guard.ts`) and checks `can(principal.role, "hq.view")` before
touching the data, falling back to a generic "Department" title
otherwise. Re-reviewed and approved. The file in this folder already has
the fix -- this note is just the record of it.

## To apply, next run (once git works here, or by hand)

1. Copy `lib/admin-hq.ts` and the `app/admin/hq/**` tree from this folder
   into the real locations (same relative paths, drop the
   `hq/product/drafts/office-page/` prefix).
2. Apply the three edits above.
3. `npm run build` (or `tsc --noEmit`) to catch anything that drifted
   since this was written against today's codebase.
4. Branch, QA subagent review, PR against `work` -- per charter.
5. Delete this `hq/product/drafts/office-page/` folder once it's merged
   (or leave it; it's documentation either way, just stale after that).
