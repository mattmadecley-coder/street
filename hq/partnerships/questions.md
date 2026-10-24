# Questions for Matthew

## Assigned by Matthew

(none open right now)

## Open

- **2026-10-24 — Daily brand report batch for 2026-10-23 ready for your approval in /admin/reports.** 4 drafts built: MORE MONEY MORE LOVE (2 shoppers), NAMED COLLECTIVE (1 shopper), Cold Culture (1 shopper), Meji Meji (1 shopper, their first-ever report). All QA-reviewed; one wording fix applied to the Meji Meji draft (see log). **Recommendation:** approve & send once Legal's mailing-address item is resolved — sending is already hard-blocked by the app until `BRAND_REPORTS_MAILING_ADDRESS` is set, so there's no risk of these going out early.

- **2026-10-24 — Two bounced report addresses still unfixed: support@brokenplanet.com and info.hmddla@gmail.com (Hmdd).** Re-ran the contact finder against both brands' public pages; it returned the exact same (bounced) address both times — their own site doesn't list an alternate. Re-checked again this run (as of the 12:41 ET finder pass) — no change. **Recommendation:** either you have another way to reach these two brands (a different inbox, an Instagram DM, a known contact), or we leave their reports skipped/paused until one surfaces. Let me know which.

- **2026-10-24 — Flagging a code bug for Product/Engineering (not something Partnerships can fix): `lib/brand-report.ts` line ~208.** The first-ever-report intro hardcodes the word "shoppers" (plural) regardless of the actual count — so a brand's very first report overstates traffic when `shoppers` is 1 (e.g. "yesterday shoppers found you" when it was exactly one shopper). I manually corrected the one live draft this hit today (Meji Meji), but the underlying template will keep doing this for every future first-send with exactly 1 shopper until the line is fixed to use the file's own `plural()` helper. **Recommendation:** route to Product/Engineering as a small copy fix.

- **2026-10-24 — AMBYTION decline email is ready to send.** Per your chat decision, replaced the holding/acknowledgment Gmail draft to Ronald Guess (myambytionllc@yahoo.com) with a soft, general decline — thanks them for applying, says the brand isn't quite the right fit for the site yet, invites a future reapplication, no mention of the creative/design reasoning. QA sent it back once (a conditional phrase risked inviting a "what needs to change?" reply); fixed and it's now in Gmail drafts, QA-cleared. **Recommendation:** review and send when ready — nothing else needed from me on this one.

## Answered

Format once answered: move the question under here with
`**Q:** ... **A:** ... (YYYY-MM-DD)`.

**Q:** New application: Cley (cley.com) — applicant "Matthew Radford" at mattmadecley@icloud.com, which looked like it might be Matthew's own store rather than a third-party applicant. Was this his, and did he want it onboarded? **A:** Confirmed (chat, via GM) — it was Matthew testing the application flow with his own address, not a real applicant. Ignored entirely: no onboarding, no reply sent. (2026-10-24)

**Q:** New application: AMBYTION (shopambytion.com) — real Shopify store, live products, no red flags found in the storefront check. Approve for onboarding? **A:** Matthew reviewed the storefront himself (chat, via GM) and decided not to approve it. Declined — see the Open section above for the decline-email draft now ready for him to send. (2026-10-24)
