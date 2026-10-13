# Street admin: how it works and how to run it

This is the guide for anyone who works on, or relies on, the admin at `/admin`.
It covers what each part does, what has to be switched on in the database, how to
roll changes out safely, and what to do when something goes wrong.

## The pieces

| Area | Where | What it does |
|---|---|---|
| Shell | `components/admin/admin-chrome.tsx` | Sidebar, top bar, quick find (`Ctrl+K`), toasts, light/dark theme |
| Design tokens | `app/admin/admin-ui.css` | Colors, sizes and shared components. Light and dark both pass WCAG AA (tested) |
| Date range | `lib/date-range.ts`, `components/admin/date-range-picker.tsx` | Today / Yesterday / Last 7 / 30 / 90 / Month to date / Last month / Year to date / Custom, with comparison |
| Metrics | `lib/analytics-metrics.ts`, `lib/analytics-glossary.ts` | One definition of every number. The Definitions page lists them in plain words |
| Alerts | `lib/admin-alert-rules.ts`, `lib/admin-alerts.ts` | Rules, editable thresholds, acknowledge and snooze |
| Accounts | `lib/admin-guard.ts`, `lib/admin-users.ts`, `lib/admin-permissions.ts` | Personal logins, roles, two-step sign-in, revocable sessions |
| Audit log | `lib/audit.ts`, `/admin/activity` | Who did what and when. Append-only |
| Trash | `lib/trash.ts` | Deleting a product hides it and keeps it recoverable |

## Rules that keep the numbers trustworthy

- Home, Analytics, Compare and Alerts all use the same code, so they agree.
- A day runs midnight to midnight in the **reporting time zone** (Settings, default Eastern).
- "Today" is compared with yesterday **up to the same time**. A range that includes today is compared with an equally long slice of the earlier period.
- Repeat clicks by the same visitor on the same thing within 30 minutes count once.
- "No prior data" is shown instead of a made-up +100% when there is nothing to compare with.
- The raw-event loader holds at most 50,000 rows. If a range is bigger, a yellow banner says the oldest events were left out. The proper fix is SQL roll-ups (see "Later work").

## Database changes (migrations)

| File | Adds | Switches on |
|---|---|---|
| `supabase/migrations/20261014_admin_state.sql` | `admin_state` table (service role only) | Editable alert thresholds, acknowledge/snooze, chart notes, alert digest memory, brand permission records, homepage history |
| `supabase/migrations/20261015_admin_accounts.sql` | `admin_users`, `admin_sessions`, `audit_log`; `deleted_at` on products and brands | Personal accounts, activity log, product trash |

**Applied on 2026-10-13**, first to a staging database, then to production. Both are safe to run again.
The admin degrades gracefully if a table is missing: each feature shows a "switches on after the migration" note.

- **Staging database:** `street_staging`, a second database inside the same Postgres container on the VPS (no extra containers, so no extra memory). It holds a copy of production data from 2026-10-13. To test a future migration: restore a fresh `pg_dump` of `public` into it, apply the migration there, and check before touching production.
- **Backups:** `/root/backups/` on the VPS holds `pg_dump -Fc` backups of the `public` schema taken just before the migrations (`street-public-*.dump`, `pre-prod-*.dump`). Restore with `pg_restore --clean --no-owner -d postgres <file>` from inside the Postgres container.
- **Lesson:** Supabase gives every new table broad default permissions (including to the service role), so migrations must `revoke all` from every role first and then grant back only what is needed. This is what keeps the audit log append-only.

### Switching to personal accounts

1. Sign in with the shared password and open **Team**.
2. Create the first owner account (your name, email and a 12+ character password). The shared password stops working at that moment.
3. Sign in with the new account and set up two-step sign-in when asked.
4. Add other people from Team (a temporary password is shown once). Check each role sees only what it should.
5. Optional safety net for the first day: set `ADMIN_ALLOW_LEGACY_LOGIN=true` in Coolify so the shared password still works at `/admin/login?mode=legacy`. Remove it afterwards.

## Roles

| Role | Can do |
|---|---|
| Owner | Everything, including the team and permanent deletion |
| Admin | Everything except the team and permanent deletion. Must use two-step sign-in |
| Catalog editor | Brands, products, collections. Cannot delete or send email |
| Marketing | Homepage, report drafts, social, chart notes. Cannot change the catalog |
| Analyst | Read only |

Every Server Action checks the role itself (`requirePermission`); hiding a button is never the only protection.

## Environment variables

See `.env.example`. New ones: `ADMIN_SESSION_SECRET` (optional), `ADMIN_ALLOW_LEGACY_LOGIN` (break-glass), `ALERT_SLACK_WEBHOOK_URL`, `ALERT_EMAIL_FROM`, `ALERT_EMAIL_TO`. The cron endpoints now **refuse** requests when `CRON_SECRET` is missing in production.

## When something goes wrong

**Locked out.** Wait 15 minutes (the lockout lifts by itself). If every owner is locked out of their account, set `ADMIN_ALLOW_LEGACY_LOGIN=true`, redeploy, sign in at `/admin/login?mode=legacy` with the shared password, fix the account in Team, then unset the variable.

**Lost phone for two-step sign-in.** An owner opens Team, picks the person and chooses *Reset two-step*. They set it up again at next sign-in. If the owner lost theirs, use the break-glass step above.

**Someone left.** Team, pick them, *Deactivate*. Their sessions end immediately and their history stays in Activity.

**Deleted the wrong product.** Products, status *Trash*, *Restore to the site*. (Needs the accounts migration. Without it, deletes are permanent and ask for confirmation.)

**Homepage went wrong.** Homepage, *Fallback history*, *Restore* the earlier version.

**Numbers look low for a long range.** Look for the yellow banner about the row limit. Use a shorter range.

## Tests

```bash
npm run typecheck   # TypeScript
npm test            # unit and integration tests (no real database needed)
```

CI runs both on every pull request (`.github/workflows/ci.yml`). Tests use an in-memory stand-in for the database REST API (`tests/fakes/supabase-rest.ts`). SQL migrations are checked separately in an in-memory Postgres (see the notes at the top of each migration).

## Later work (not built yet)

- SQL roll-ups so analytics no longer load raw rows (removes the 50,000-row limit). Needs a staged migration.
- A fully separate staging deployment of the app (the staging database exists; the app is still only run locally against it).
- Uptime monitoring, database backups with a tested restore, a real job queue for scheduled work.
- Smart (rule-based) collections, saved product filters, brand bounce/unsubscribe stats.
- Moving secrets out of local notes into a secrets manager, and rotating the ones that have lived in plaintext.
