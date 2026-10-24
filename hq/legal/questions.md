# Questions for Matthew

## Open

**Q1 (unblocks Growth: Lifecycle sending):** SMS-consent and mailing-address
wording is drafted and QA-approved. Two things need your decision before
Growth: Lifecycle can send anything real:

1. **SMS consent fine print** — replace the placeholder currently sitting in
   `lib/email-popup-config.ts` (`smsFineprint`) with:

   > By entering your number, you agree to receive recurring automated
   > marketing texts (like drop alerts) from Street at the number provided.
   > Consent isn't a condition of any purchase. Message frequency varies.
   > Msg & data rates may apply. Reply STOP to cancel, HELP for help. See
   > streetdotcom.com/terms and streetdotcom.com/privacy.

   This is plain text on purpose — the popup field doesn't render links, so
   the Terms/Privacy references are written out as bare URLs rather than
   clickable links (a real link there would need an engineering change to
   the popup component, not a wording change; flagging as a nice-to-have,
   not a blocker).

   **Separate, real dependency, not a wording problem:** there is no SMS-
   sending provider wired up yet (no Twilio or equivalent in the codebase)
   and no STOP/HELP keyword handling — today the form only captures a phone
   number and timestamps consent (`consent_sms_at`). This wording is correct
   and ready to ship into the popup now, but it does not make real SMS
   sending possible by itself. That's an Infrastructure/Growth: Lifecycle
   build-out, separate from my sign-off here.

2. **CAN-SPAM mailing address** — every marketing/report email needs a
   valid physical (or registered-agent/PMB) postal address in the footer.
   The code already enforces this: `BRAND_REPORTS_MAILING_ADDRESS` is unset
   right now, and sending is hard-blocked until it's set (verified in
   `lib/email-send.ts`). I'm not picking the actual address — that's yours
   to decide — but the line should take this plain-text, single-line shape:

   > Street · <business/entity name>, <street address or PMB>, <city>,
   > <state> <ZIP>

   Two things worth weighing before you pick a value: (a) which entity name
   to use — Street itself, or Scale House LLC if that's the entity Street
   operates under; (b) CAN-SPAM explicitly allows a registered commercial
   mail-receiving agency (PMB/CMRA, e.g. a UPS Store box) instead of a street
   address, which a lot of small online businesses use specifically so a
   home address isn't in every outbound email. Once you tell me the value
   (or just set it directly in `.env.local` as `BRAND_REPORTS_MAILING_ADDRESS`),
   I'll confirm the format renders correctly and clear Growth: Lifecycle to
   send.

**My recommendation:** approve the SMS fine print as-is; for the mailing
address, set a PMB/CMRA line rather than a home address, under whichever
entity name you want publicly associated with Street's emails. QA reviewed
both for accuracy and tone and approved them (hq/qa/log.md, 2026-10-24).

**Q2 (new finding — brand permission records):** Checking "is brand
permission on file" per my charter, I found the admin tool built for this
(`lib/brand-meta.ts`, tracked per-brand in `admin_state["brand_meta"]`,
editable at `/admin/brands`) has zero records in it — not one of the 91
brands currently in the catalog has a permission status saved there, and
only 2 brands have ever come through the self-serve `/brands/apply` form.
That doesn't mean permission wasn't obtained for the other ~89 (you may well
have arranged those directly), but there's currently no audit trail for any
of it, which is exactly the record the house rules ask Legal to confirm is
"on file." Flagging as Tier 3 since it's your call how to close the gap —
options: (a) have Partnerships start backfilling `/admin/brands` permission
status as they touch each brand in their daily report runs, going off
however permission was actually obtained even if informally; (b) if you
know some of the 89 weren't formally cleared, decide whether to pause
Street's/Partnerships' outreach on those pending a quick permission check.
Not urgent enough to say stop anything today, but it's the one real gap in
my three standing checks this run, so I didn't want it to sit unflagged.

## Answered

Format once answered: move the question under here with
`**Q:** ... **A:** ... (YYYY-MM-DD)`.
