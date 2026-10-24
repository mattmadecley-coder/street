# Questions for Matthew

## Assigned by Matthew

- 2026-10-24: Cley application -- Matthew confirmed this was him testing
  the application flow (his own address, not a real applicant). Ignore
  it entirely: no onboarding, no reply. (assigned by Matthew, chat)

- 2026-10-24: AMBYTION application -- Matthew reviewed their storefront
  himself and decided not to approve them. Decline the application
  (don't onboard). Replace the existing holding/acknowledgment Gmail
  draft with a decline email instead, as a new Gmail draft (per charter,
  draft only -- Matthew sends). Keep the tone soft and general, do not
  spell out that it's about their creative/design choices -- something
  like: thank them for applying, let them know that at the moment the
  team doesn't think the brand is quite ready to fit the site yet, and
  that they're welcome to submit another application down the line.
  QA it the same way the other drafts get QA'd. (assigned by Matthew,
  chat)

## Open

- **2026-10-24 — New application: Cley (cley.com).** Applicant on file is "Matthew Radford" at mattmadecley@icloud.com. That inbox already receives Google Merchant Center emails addressed to "Cley" ("Cley, enable your store ratings") and your Instagram feed suggests "cley.us" as an account you'd follow — this looks like it may be your own store, not a third-party applicant. Standing rule still requires your explicit approval before onboarding any brand, your own or not, so: is this your own Cley store, and do you want it onboarded? No reply has been drafted to the applicant since it's your own address. **Recommendation:** confirm ownership, then either approve onboarding (sanctioned, you own the feed) or decline/withdraw if it was a test submission.

- **2026-10-24 — New application: AMBYTION (shopambytion.com).** Founder Ronald Guess, myambytionllc@yahoo.com. Checked the storefront: real Shopify store, live products (Signature Tee $40, two more tees $40 each, Launch 001 Hoodie $120), working cart/checkout path. One minor oddity — the hoodie shows a "$0.00 regular price" next to the $120 sale price, probably just a Shopify setup quirk, not a sign of anything wrong. A holding/acknowledgment reply (not an approval) is sitting in Gmail drafts, QA-approved. **Recommendation:** approve for onboarding via the normal feed-sanctioning process; nothing here reads as spam or a red flag.

- **2026-10-24 — Daily brand report batch for 2026-10-23 ready for your approval in /admin/reports.** 4 drafts built: MORE MONEY MORE LOVE (2 shoppers), NAMED COLLECTIVE (1 shopper), Cold Culture (1 shopper), Meji Meji (1 shopper, their first-ever report). All QA-reviewed; one wording fix applied to the Meji Meji draft (see log). **Recommendation:** approve & send once Legal's mailing-address item is resolved — sending is already hard-blocked by the app until `BRAND_REPORTS_MAILING_ADDRESS` is set, so there's no risk of these going out early.

- **2026-10-24 — Two bounced report addresses still unfixed: support@brokenplanet.com and info.hmddla@gmail.com (Hmdd).** Re-ran the contact finder against both brands' public pages; it returned the exact same (bounced) address both times — their own site doesn't list an alternate. **Recommendation:** either you have another way to reach these two brands (a different inbox, an Instagram DM, a known contact), or we leave their reports skipped/paused until one surfaces. Let me know which.

- **2026-10-24 — Flagging a code bug for Product/Engineering (not something Partnerships can fix): `lib/brand-report.ts` line ~208.** The first-ever-report intro hardcodes the word "shoppers" (plural) regardless of the actual count — so a brand's very first report overstates traffic when `shoppers` is 1 (e.g. "yesterday shoppers found you" when it was exactly one shopper). I manually corrected the one live draft this hit today (Meji Meji), but the underlying template will keep doing this for every future first-send with exactly 1 shopper until the line is fixed to use the file's own `plural()` helper. **Recommendation:** route to Product/Engineering as a small copy fix.

## Answered

Format once answered: move the question under here with
`**Q:** ... **A:** ... (YYYY-MM-DD)`.
