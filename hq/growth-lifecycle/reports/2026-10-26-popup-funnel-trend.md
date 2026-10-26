# Signup popup funnel — trend since launch, 2026-10-26

Normal Tier 1 checks came back clean again this run (209 total
`email_popup_events`, +13 since the last check-in; still only 2
`email_contacts`, 0 sent/opened/clicked; popup config unchanged —
`enabled=true`, placeholder SMS fine print, `updated_at` still 10-13).
Rather than re-run a breakdown already done (by-step on 10-25, by-device/
by-page on 10-25), this run looks at the funnel over time for the first
time — every day since the popup actually started collecting events
(2026-10-12) through today.

Same caveat as the last two reports: still a small sample. Take the
percentages as directional, not precise.

## The headline: zero signups in 7 days, and it's not just a mobile-mix story

Both of Street's two signups happened early — 10-15 and 10-19. Nothing
since, despite the popup still showing 60-110 times a week:

| Day range | `shown` | `closed_email_step` | dismiss% | `email_submitted` |
|---|---|---|---|---|
| Week 1 (10-12 → 10-19) | 49 | 30 | 61% | 1 |
| Week 2 (10-19 → 10-26) | 68 | 51 | 75% | 1 (same day as week-1/2 boundary) |

Overall dismiss rate climbed 61% → 75% week over week. The 10-25 report
already found mobile dismisses far more than desktop (84% vs 44% at the
time), so the first question is whether this is just more mobile traffic
pushing the average up. It's partly that — mobile went from 53% of
`shown` events in week 1 to 65% in week 2 — but that's not the whole
story:

| Device | Week 1 dismiss% (of N shown) | Week 2 dismiss% (of N shown) |
|---|---|---|
| Desktop | 32% (22) | 58% (24) |
| Mobile | 85% (26) | 84% (44) |

Mobile's own dismiss rate held essentially flat. Desktop's nearly
doubled, 32% → 58%, on a similar sample size both weeks. So two things
are compounding, not one: more of the traffic is now mobile (which has
always dismissed more), and desktop itself is also converting worse than
it did in the popup's first week.

## What this does and doesn't mean

- Samples are still small (22-44 `shown` per device per week) — this
  could tighten back up with more data. Flagging it now because it's a
  real week-over-week shift in the same direction on both cuts (overall
  and desktop-only), not a one-day blip.
- No code or config changed in this window (`email_popup_settings`
  `updated_at` is still 10-13), so this isn't a regression from a popup
  change — whatever's driving it is either organic (traffic source mix,
  novelty wearing off) or something outside the popup itself.
- Nothing here changes the Q1 recommendation already open (SMS wording
  mismatch) — flagging as a separate, lower-urgency trend to watch.

## Worth watching, not acting on yet

1. If desktop's dismiss rate keeps climbing next week, it's worth asking
   whether *something* about the first-week audience was different
   (e.g., direct/early visitors vs. whatever's driving traffic now) — a
   `referrer`/`utm_source` cut on `email_contacts` and popup `shown`
   events would help once there's more than 2 contacts to look at.
2. Combined with the existing 10-25 mobile/`/catalog` findings, the
   popup's real-world conversion keeps pointing at design/targeting
   friction rather than low intent — still no signups to lose by testing
   any of the 3 ideas from 10-25, if Matthew wants to.

Still directional, still nothing changed live.
