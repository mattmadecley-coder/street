# This week's goals

Format: `- [ ] <goal>` or `- [x] <goal> (done YYYY-MM-DD)` or
`- [~] <goal> (blocked: <why>)`. Rewritten by the GM each Friday after the
weekly review; a department can add a goal mid-week if something real comes
up, but shouldn't remove one Matthew hasn't seen moved.

- [x] First run: confirm/expand the known paid-tools list (Postiz,
  OpenRouter, GoDaddy, Netcup, Claude) and their renewal dates from
  billing emails (done 2026-10-24 — see hq/finance/reports/paid-tools.md;
  Netcup and Postiz billing not visible via Gmail, flagged as a gap)
- [x] Check status of the free tiers to watch (Apify's cap, Resend,
  Upstash QStash, Cloudflare, GitHub Actions minutes) (done 2026-10-24 —
  Apify's cap-hit on 2026-09-29 confirmed, nothing else capped)
- [x] Produce the first weekly open-items rollup across departments in
  `hq/finance/reports/` (done 2026-10-24 — see
  hq/finance/reports/open-items-rollup.md, built from every department's
  questions.md)
- [x] Refresh the rollup same-day once it went stale (done 2026-10-24,
  evening — 6 of 12 departments' questions.md had changed since the
  morning pass, including a new urgent Partnerships finding; rewrote
  open-items-rollup.md rather than waiting for next Monday)
- [x] Second-pass billing re-check + another rollup refresh (done
  2026-10-25 morning — confirmed no new charges since 2026-10-24 20:46 via
  Gmail; rewrote open-items-rollup.md again since 5 departments'
  questions.md had moved: Partnerships' auto-send scope grew to 3 weeks,
  Catalog's disabled-brand count grew from 2 to 9 plus a new homepage-
  schedule question, Growth-Social's carousel bug gained a job-failure
  signal, Analytics filed a new SEO CTR finding, Growth-Lifecycle flagged
  a missing-.env.local process issue)
- [~] Self-directed: tried a broader Gmail search for Netcup/Postiz
  billing (subscription/invoice/payment/trial keywords, not just the
  tool names) to close the gap noted in paid-tools.md (blocked:
  confirmed there is genuinely nothing to find — both inboxes only ever
  received marketing/newsletter mail, no invoice or billing email exists
  for either tool in this Gmail account; closing this out as "confirmed
  not visible via Gmail" rather than re-checking it every run — would
  need Matthew to say where Netcup bills, or to check Postiz's billing
  page directly)
- [x] Self-directed: third billing re-check + fourth rollup refresh (done
  2026-10-25 afternoon — confirmed no new charges since 2026-10-24 20:46
  via Gmail; rewrote open-items-rollup.md again after the big merge of
  other departments' work pulled in — biggest change was Growth-Social's
  carousel bug escalating to a full posting outage, which Finance found
  independent corroboration for via a Postiz "Streak Ended" notification
  email; also surfaced 2 dead brand storefronts from Partnerships, a new
  Infrastructure cross-department ask, and Catalog's needs_review cleanup
  question)
- [x] Self-directed: fourth billing re-check + fifth rollup refresh (done
  2026-10-26 morning — confirmed no new charges since 2026-10-24 20:46 via
  Gmail, now clean for two full days; pulled in a large merge from `work`
  that brought in Analytics/Growth-Lifecycle/Growth-SEO updates, found and
  added 2 new Product-routed findings that weren't in the prior rollup yet
  (Analytics' `results_count: null` tracking-gap root cause, Growth-SEO's
  brand-pages duplicate-canonical bug) — everything else unchanged since
  yesterday afternoon, so kept this pass short rather than restating it)
