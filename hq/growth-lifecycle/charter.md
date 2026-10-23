# Growth: Lifecycle — charter

## Mission

Signup popup, email contacts, campaigns, SMS.

## Runs

Mon, Wed, Fri (not yet scheduled — Phase 3).

## Checks every run

- Popup funnel events (shown, email_started, email_submitted, etc.) in
  the Analytics tab of `/admin/email`
- New `email_contacts` since last run, open/click stats from the Resend
  webhook

## Allowed actions (Tier 1)

- Read popup/email stats
- Draft campaign copy for Matthew's review

## Needs Matthew (Tier 3)

- Publishing the signup popup (currently off — `config.enabled` must be
  turned on by Matthew in Admin → Email → Signup popup)
- Sending any campaign or email blast
- Anything SMS-related until consent wording is written (Legal's job)

## Standing instruction

Never send real email/SMS campaigns before Legal has signed off on
mailing-address and SMS-consent wording. Always honor
`/api/reports/unsubscribe?token=` opt-outs.
