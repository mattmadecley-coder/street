# Street Admin Overhaul — Plan

Goal: make the Street admin as clear, trustworthy and team-ready as Shopify's, so
several people can work in it safely as Street grows.

Sources: the backend/security review and the live UI review (Oct 13, 2026).
Items needing Matthew's approval (per CLAUDE.md): DB migrations with real data
impact, production infra changes, deploy-path decision, credential rotation,
mass emails.

## Status (updated after the build)

Built in the working tree, **not committed and not deployed**. See `docs/ADMIN.md`
for how to run and roll it out.

| Phase | State |
|---|---|
| 1 Trust fixes | Done. Security hardening, honest comparisons, matching numbers, confirmations, repo tidy |
| 2 Design system and shell | Done. Sidebar, tokens, light/dark, components, toasts, quick find, no static inline styles |
| 3 Date-range engine | Done. Today/Yesterday/7/30/90/MTD/Last month/YTD/Custom, compare, configurable time zone |
| 4 Analytics, Compare, Alerts | Done except SQL roll-ups. Tabs, shared metrics, definitions, thresholds, acknowledge/snooze, chart notes, daily digest |
| 5 Accounts, roles, audit | Done, **waits on migration 20261015**. Personal logins, 2FA, roles, sessions, activity log, trash |
| 6 Catalog tooling | Mostly done. System health, bulk review, brand search/filters, brand permission records. Not built: smart collections, saved filters, bulk sync |
| 7 Homepage and reports | Done for homepage (preview, history, restore) and report permissions. Not built: bounce/unsubscribe stats, per-brand frequency |
| 8 Engineering foundation | Partly done: CI, tests, docs. Needs your decisions: one deploy path, staging environment, monitoring and backups |

Everything that needs a database change is written as a migration under
`supabase/migrations/` and checked in an in-memory Postgres, but **not applied anywhere**.

---

## 0. Guiding principles

1. **Trust first.** Wrong or contradictory numbers and stale warnings come before polish.
2. **One time-range everywhere.** Today / Yesterday / Last 7 / Last 30 days drive every page (section 3).
3. **Task-first, not data-first.** Each page answers "what needs my attention?" before showing tables.
4. **One component library.** No more inline styles. Social page is the visual reference.
5. **Safe by default.** Per-person login, per-action permission checks, audit log, undo instead of delete.
6. **Ship in small slices.** Each phase is deployable on its own and reversible.

---

## 1. Phase 1 — Trust fixes (quick wins, ~3–4 days)

Low risk, high visibility. Ship first.

| # | Fix | Where |
|---|-----|-------|
| 1.1 | Alerts page: padding, proper card, correct heading sizes, severity icon + label (not color only), "View affected", Acknowledge, Snooze buttons | `app/admin/analytics/alerts/page.tsx` |
| 1.2 | Compare page: show "No prior data" instead of `+100%` when previous is 0; show absolute delta | `analytics/comparison/page.tsx` |
| 1.3 | Metric definitions: one source of truth for visitors / sessions / outbound clicks. Reconcile Analytics (270 visitors, 98 clicks) vs Compare (493, 45) over the same 30 days. Add an "i" tooltip on every tile saying exactly how it is counted | `lib/analytics-*.ts`, tiles |
| 1.4 | Remove stale content: Render "System health" card, "Vercel" wording on login, Render link. Replace with live health (section 6) | `app/admin/page.tsx`, login page |
| 1.5 | Nav stays visible while loading (move nav into a shared layout; skeletons render inside it) | new `app/admin/layout.tsx`, `loading.tsx` files |
| 1.6 | Fix overflow: Products filter row, Collections inputs | CSS |
| 1.7 | Security quick fixes: validate `return_to` (must start with `/admin`); constant-time password compare; stop trusting raw `x-forwarded-for` for lockout (use platform-provided client IP); auth guard inside every server action | `lib/admin-auth.ts`, all `actions.ts` |
| 1.8 | Confirmation dialog on destructive/mass actions ("Approve & send all", delete product) that lists exactly what will happen | `components/admin/confirm-*` |
| 1.9 | Repo cleanup: delete stray `.ps1`, logs, `Claude outputs/` from root (or move to `/scripts`, `/docs`) | repo root |

**Done when:** no page shows a misleading number or stale warning; destructive actions need confirmation; every action checks auth itself.

---

## 2. Phase 2 — Design system and app shell (~1.5 weeks)

### 2.1 Shell
- **Left sidebar**, grouped:
  - Home
  - Catalog: Brands, Products, Collections
  - Marketing: Homepage, Reports, Social
  - Insights: Analytics, Compare, Alerts
  - Settings (team, store, integrations, activity log)
- **Top bar:** global search (`Ctrl+K` command palette: jump to brand/product/page), **date-range picker (section 3)**, alerts bell with count, user menu.
- Collapsible sidebar; bottom tab bar on phones.
- Breadcrumbs and page header component (title, subtitle, primary action).
- Shared `app/admin/layout.tsx` replaces per-page `<AdminNav>`.

### 2.2 Component library (`components/admin/ui/`)
Button, IconButton, Input, Select, Checkbox, Badge/Pill, Card, StatTile (value, delta, sparkline), DataTable (sort, filter, select, bulk bar, sticky header, column picker, responsive card mode), Tabs, Modal/ConfirmDialog, Toast, Tooltip, EmptyState, Skeleton, Banner, FormField, DateRangePicker, Pagination.

### 2.3 Tokens and typography
- Design tokens (color, spacing, radius, shadow) in one CSS file; light **and dark** theme.
- Minimum 14px body text; 12px only for captions; verify WCAG AA contrast.
- Calmer hierarchy: heavy uppercase only for the page title; section titles quieter.
- Visible focus rings; keyboard navigation; skip link; icons plus text for status (never color alone).

### 2.4 Feedback patterns
- Toasts with Undo instead of `?saved=` URL params.
- Unsaved-changes warning on forms.
- Optimistic updates where safe.

**Done when:** every admin page uses the shared components, with zero inline `style={{}}` (currently 137), and renders correctly at 360px, 768px and 1440px.

---

## 3. Phase 3 — Global date-range engine (the "Shopify" time controls) (~1 week)

This is a cross-cutting feature, built once and used everywhere.

**Presets (in this order):** Today · Yesterday · Last 7 days · Last 30 days · Last 90 days · Month to date · Last month · Year to date · Custom range.

**Behavior**
- One picker in the top bar; selection stored in the URL (`?range=7d&compare=prev`) so links are shareable, and remembered per user.
- **Compare toggle:** previous period / same period last year / none. Delta chips (▲ 12% / ▼ 4% / "No prior data").
- **Today is partial:** compare "today so far" with "yesterday by this same time" (Social already does this; make it standard). Label it clearly: "as of 2:05 PM ET".
- **Granularity auto-switches:** hourly for Today/Yesterday, daily for up to 90 days, weekly beyond.
- **Time zone** is a store setting (default Eastern), shown next to the picker; all pages and cron windows use it.
- **Everywhere it applies:** Home, Brands (clicks sent per brand), Products (views/clicks), Analytics, Compare, Alerts evaluation window, Social, Reports. Replace the existing per-page date forms and `lib/date-range.ts` variants with one resolver.
- **Home dashboard** leads with tiles for the selected range: visitors, sessions, outbound clicks, click-through rate, top brands, top searches, each with a sparkline and delta.
- **Performance:** serve from SQL aggregates / summary tables, not raw event rows (removes the ~5,000-row cap in `lib/analytics.ts`).
- **Saved views** and shareable read-only links for brands/investors (later).

**Done when:** changing the picker updates every page consistently; Today, Yesterday, 7d and 30d totals match across pages; a test covers each preset, including time zone and daylight-saving edges.

---

## 4. Phase 4 — Analytics, Compare and Alerts rebuild (~1.5 weeks)

- Analytics split into tabs: **Overview · Traffic · Discovery & search · Brands · Products · Retention · Audience**. One scroll replaced by focused views (currently 23 sections, ~14,700px).
- Charts: responsive, no 620px forced width, tooltips, annotations ("brand X launched"), toggle metrics.
- Compare folds into Analytics as the "compare" toggle (Phase 3), so there is no separate contradictory page; keep `/compare` redirecting.
- Metric glossary page and tooltips from item 1.3.
- **Alerts**: severity, owner, status (open/acknowledged/snoozed/resolved), history, editable thresholds (default scaled to traffic), links to the fix. Push delivery by email and Slack/SMS; daily digest.
- CSV export respects the selected range; scheduled exports later.

**Risk tier:** Level 3 for anything touching outbound-click tracking (`/api/out`, `outbound_clicks`) — adversarial QA pass required. Read-only reporting changes are Level 2.

---

## 5. Phase 5 — Access control, roles and audit log (~2 weeks)

*(Could run in parallel with Phases 2–4 since it is mostly backend.)*

- **Real accounts** (Supabase Auth, already in your stack): email + password, 2FA for owners, invites, password reset.
- **Roles:** Owner · Admin · Catalog editor · Marketing · Analyst (read-only). Permission matrix per action (e.g., only Admin+ can delete or send mass emails).
- **Sessions:** server-side, revocable, expiring; "active devices" list; force-logout.
- **Audit log:** who / what / when / before-and-after for every write; searchable Activity page; per-brand and per-product history tabs.
- **Soft delete + trash** (30-day retention) for products and brands; restore button.
- **Approval step** for mass emails (second person or explicit confirm).
- Retire the shared `ADMIN_PASSWORD` after migration (keep a break-glass owner login).
- Secrets: rotate keys that have lived in plaintext notes; move to a secrets manager; scoped access per person. **Needs Matthew's approval.**

**DB migrations (need approval):** `admin_users`, `roles`, `admin_sessions`, `audit_log`, `deleted_at` columns, alert state table.

---

## 6. Phase 6 — Catalog tooling (~2 weeks)

**Overview / Home**
- "Needs attention" inbox: products to review, stale brand syncs, broken images, zero-result searches, failed emails — each links to the fix.
- Live system health: last sync, last cron success, queue depth, error rate, VPS memory/CPU (replaces the Render card).

**Products**
- Data table with checkboxes and bulk actions (recategorize, tag, hide, approve).
- Review queue mode: large image, AI suggestion + confidence, Accept / Change buttons, keyboard shortcuts (arrows, Enter).
- Saved filters, sort, and "AI vs human override" stats to find weak spots in the classifier.

**Brands**
- Table with search, filters (status, problems), sort, bulk sync.
- Brand detail page: sync history, health, contact, **permission status / source / date** (supports your brand-permission boundary), claim/removal requests queue, clicks sent, report history, notes.
- 4 stale brands surfaced with direct "Retry sync" action.

**Collections**
- Smart (rule-based) and manual collections, drag-to-order, scheduling, preview.

**Level 3 note:** bulk catalog operations and classification pipeline changes get the adversarial QA pass.

---

## 7. Phase 7 — Homepage merchandising and Reports (~1.5 weeks)

**Homepage**
- Live preview (desktop + mobile) beside the form.
- "Currently live" shown first; fallback clearly separate.
- Schedule shown as a calendar/timeline; draft → publish; version history with rollback.
- Sections/shelves ordering (drag and drop).

**Reports**
- Template preview, send log, bounce/unsubscribe stats, per-brand frequency.
- Confirmation listing recipients; queued sending with rate limits.
- Move hardcoded test email address and setup checks into Settings.

---

## 8. Phase 8 — Engineering foundation (runs alongside everything)

- **CI on every PR:** typecheck, lint, build, unit tests.
- **Tests first** for: date-range resolver, metric calculations, auth/permissions, classifier overrides, sync code.
- **One deploy path** (confirm Coolify live; remove Vercel/Cloudflare config) + staging environment + deploy log. **Needs Matthew's approval.**
- **Reliability:** uptime monitoring, DB backups with a tested restore, real job queue for crons (QStash) instead of GitHub Actions only, VPS capacity plan (2 vCPU / 3.8 GB).
- **Docs:** onboarding guide, runbook for common problems, metric glossary.

---

## 9. Suggested order and timeline

| Weeks | Work |
|-------|------|
| 1 | Phase 1 (trust fixes) + start Phase 8 (CI, tests) |
| 2–3 | Phase 2 (shell + components) |
| 3–4 | Phase 3 (date-range engine) |
| 4–6 | Phase 4 (analytics rebuild) · Phase 5 (accounts/roles/audit) in parallel |
| 6–8 | Phase 6 (catalog tooling) |
| 8–9 | Phase 7 (homepage + reports) |
| ongoing | Phase 8 foundation |

Total about 9–10 weeks of focused work; much faster if some phases are parallelized.

---

## 10. Decisions needed from Matthew

1. **Confirm the live deploy path** (Coolify/VPS?) so the other two can be removed.
2. **Roles:** which roles and permissions do you want on day one? Who joins first?
3. **Time zone:** keep Eastern as the default, or make it configurable per user?
4. **Metric definitions:** what counts as a "visitor" and an "outbound click" (exclude bots? admin browsers? dedupe window?) — this decides how the Analytics/Compare mismatch is resolved.
5. **Brand/investor sharing:** do you want read-only shareable dashboards for brands later?
6. **Order of work:** keep the order above, or start with auth/roles first?
7. **Approvals:** OK to run DB migrations in a staging copy first, then production?
