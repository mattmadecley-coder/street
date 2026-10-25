# Questions for Matthew

## Open

**Q1 — the signup popup is already live, under unapproved SMS wording.**
My charter describes the popup as off, but `email_popup_settings.config.enabled`
is `true` right now, and it's been live since at least 2026-10-15. It has
already captured 2 real contacts (email + phone + SMS consent timestamp)
through the popup. The SMS fine print shown to both of them is still the
generic placeholder in code
("By adding your number you agree to get texts from Street...Reply STOP to
opt out."), not the CAN-SPAM/TCPA wording Legal drafted and QA approved in
`hq/legal/questions.md` Q1 — which you haven't signed off on yet. No SMS
provider is wired up, so no texts have actually gone out, but the consent
experience those 2 people saw doesn't match what Legal reviewed.
**My recommendation:** either turn the popup back off until you've answered
Legal's Q1, or — if you meant to turn it on — update `smsFineprint` in
Admin → Email → Signup popup to Legal's approved text now, so new signups
see accurate language going forward. Either way, don't send anything to
the 2 already-captured contacts until Q1 is answered.

**Q2 — first welcome-email draft, ready for your review (not sendable yet).**
Drafted a one-time welcome email for new popup signups (triggered per
signup, not a blast) and sent it through QA — approved, no changes needed.
It can't actually send until Legal's Q1 (mailing address + SMS wording) is
answered — `BRAND_REPORTS_MAILING_ADDRESS` is still unset and sending is
hard-blocked in code regardless.

> Subject: You're in. Here's what's next on Street.
> Preview: Independent streetwear, first look, no fluff.
>
> Hey —
>
> You're on the list. When new pieces from independent brands drop on
> Street, you'll hear about it first — before they sell out.
>
> No spam, no filler. Just the good stuff, when it actually drops.
>
> [Browse what's live now →] (streetdotcom.com)
>
> — Street
>
> ---
> Unsubscribe: {{unsubscribe_link}}
> {{mailing_address}}

**My recommendation:** approve as-is; it'll sit ready to send the moment
Q1 clears.

## Answered

Format once answered: move the question under here with
`**Q:** ... **A:** ... (YYYY-MM-DD)`.
