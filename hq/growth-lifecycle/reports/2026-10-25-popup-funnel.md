# Signup popup funnel — first read, 2026-10-25

Self-directed this run: stats checks were otherwise clean (no new signups,
no config change since last check-in), so instead of just re-confirming the
same numbers I broke down the funnel by step for the first time. Raw counts
pulled live from `email_popup_events` (194 total events since tracking
started, 2026-10-15 through today).

## The numbers

| Step | Count | % of shown |
|---|---|---|
| `shown` | 109 | 100% |
| `closed_email_step` (dismissed before typing) | 74 | 68% |
| `email_started` (began typing) | 3 | 3% |
| `email_submitted` (step 1 complete) | 2 | 2% |
| `phone_started` | 2 | 2% |
| `phone_submitted` (full signup incl. SMS consent) | 2 | 2% |
| `phone_error` | 1 | 1% |
| `closed_phone_step` | 1 | 1% |

Caveat up front: this is a **tiny sample** — 109 impressions, 2 completed
signups — so none of this is statistically solid. Treat it as a direction,
not a verdict. 30 of the 109 `shown` events (~28%) have no matching close
or start event at all, which likely just means the user navigated away
without triggering a dismiss handler (closing the tab, back button) rather
than a tracking gap — not something to chase.

## What stands out

The big cliff is between `shown` and `email_started`: 68% dismiss the
popup immediately (`closed_email_step`) without ever touching the email
field, and only 3% start typing at all. Whatever is getting people to look
isn't getting them to act — this is a copy/offer/friction question, not a
targeting one (the popup already gates on `minPages: 2` + `delaySeconds: 20`,
so it's not showing to brand-new, cold sessions).

Once someone does start typing, conversion is actually decent — 2 of 3
`email_started` finished step 1, and both of those also finished the
optional phone step. The drop-off is entirely pre-engagement, not
mid-form abandonment.

## Ideas worth testing (not acted on — copy/config changes are Matthew's call)

1. **Swap the ask for a clearer benefit.** Current step 1 copy ("New pieces
   from independent brands drop and sell out fast. Drop your email and
   we'll tell you first.") is fine but generic — every email popup says
   some version of this. Since Street can't offer a discount (no checkout
   on Street itself), the honest differentiator is "see it before everyone
   else" — worth testing a sharper, more specific version of that instead
   of the general restated benefit.
2. **Consider testing single-step instead of two-step.** Email-then-phone
   may read as "this is going to ask me for more than my email" even
   though phone is optional — worth testing collapsing to just the email
   step, with the phone/SMS ask moved to a secondary, lower-commitment spot
   (e.g. after signup, not inside the same modal).
3. **Re-check trigger timing once there's more volume.** 20s delay + 2
   pageviews is a reasonable quality gate already; not recommending a
   change here, just flagging it as the next lever if copy changes don't
   move the needle.

None of this is urgent — volume is low enough that any one of these is a
cheap, reversible test whenever Matthew wants to run one. Flagging it now
so it's ready when he does, not because the current numbers are alarming.
