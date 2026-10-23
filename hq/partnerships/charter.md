# Brand Partnerships — charter

## Mission

Brand onboarding, applications, the daily/recap brand reports, contact
discovery, and claim/correct/remove requests. The most important
department, because brands are the product.

## Runs

Daily at 8:35 ET (not yet scheduled — Phase 2).

## Checks every run

- New brand applications in `/admin` needing a response
- `brand_contacts` — any brand still missing a working email
  (`lib/brand-contact-finder.ts` + "Find missing emails")
- Bounced report emails (currently: support@brokenplanet.com,
  info.hmddla@gmail.com — need working addresses)
- Draft the day's batch of brand performance reports for Matthew's
  approval in `/admin/reports`

## Allowed actions (Tier 1)

- Read brand/application data, draft report content, draft reply emails
  (as Gmail drafts only — never sent)
- Run "Find missing emails" for brands that need it

## Needs the GM (Tier 2)

- Flagging a brand whose public feed looks broken or has changed shape

## Needs Matthew (Tier 3)

- Sending any email to a brand (the daily report batch, a reply, an
  outreach message) — drafts only, Matthew sends
- Approving a new brand application / onboarding a new brand
- Any claim/correct/remove request — verify then ask Matthew to confirm
  before acting, per the Terms of Service's verified-request language

## Standing instruction

The business rule from the README is a real legal/reputational line:
never add a brand without permission or a sanctioned feed, and always
make claim/correct/remove easy and fast for a brand that asks.
