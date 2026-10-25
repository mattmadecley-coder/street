# Signup popup funnel — device & page breakdown, 2026-10-25

Self-directed this run: normal Tier 1 checks (popup funnel totals,
`email_contacts`, popup config) all came back clean again — 196 total
`email_popup_events` now (+2 since the 13:19 check-in), still only 2
`email_contacts`, config unchanged. Rather than re-run yesterday's
by-step breakdown (`2026-10-25-popup-funnel.md`), this run cuts the same
data two new ways: by `device_type` and by `path`. Same caveat as
yesterday applies — this is a small sample, directional only.

## By device: mobile dismisses far more than desktop

| Device | `shown` | `closed_email_step` | Dismiss rate |
|---|---|---|---|
| Desktop | 45 | 20 | 44% |
| Mobile | 64 | 54 | **84%** |
| Tablet | 1 | 1 | 100% (1 sample) |

Mobile gets almost twice the desktop traffic through the popup (64 vs 45
shown) but dismisses it at roughly double the rate. Both completed
signups came through once on desktop and once on mobile, so this isn't
"mobile never converts" — but the gap in dismiss rate is the single
clearest signal in the data so far. Likely candidates: the two-step
modal (email, then phone) may feel longer on a small screen, or the image/
copy layout may be cramped on mobile (`imageX`/`imageY`/`imageZoom` are
one fixed config, not device-specific).

## By page: every completed signup happened on the homepage, none on `/catalog`

| Path | `shown` | `closed_email_step` | Email/phone submitted |
|---|---|---|---|
| `/` (homepage) | 13 | 12 | 2 email, 2 phone (both full signups) |
| `/catalog` | 39 | 25 | 0 |
| Individual `/products/*` and `/brands/*` pages | 1-3 each | mostly 1:1 with shown | 0 |

`/catalog` gets the most impressions by far (39, double the homepage's
13) but has produced zero signups despite a near-identical ~64% dismiss
rate to the homepage. That's the biggest untapped volume in the funnel —
if the homepage's conversion rate held on `/catalog`, that volume alone
could be most of the signal we're missing.

One unrelated thing worth a glance, not a finding: `/dev-editor` (5
`shown` events) and `/test` (1) are internal/dev paths. Low volume, not
worth a line item on its own, but if those grow it'd be worth checking
whether the popup is supposed to fire there at all — could just be
someone (you?) browsing the live site from those routes rather than a
tracking bug.

## Ideas worth testing (not acted on — Matthew's call)

1. **Check the modal's mobile layout.** Given the dismiss-rate gap, worth
   a quick look at the popup on an actual phone screen — image cropping,
   button tap targets, whether the two-step flow forces scrolling.
2. **If mobile layout looks fine, test `/catalog` separately.** It has the
   volume to tell you something real faster than the homepage does. Worth
   watching whether its 0-for-39 holds or is just small-sample noise once
   more data comes in.

Still just directional — flagging so it's ready whenever Matthew wants to
act on it, not because anything here is urgent.
