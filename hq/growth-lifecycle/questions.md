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

**Q3 — welcome sequence extended to a 2nd email, QA-approved (not sendable yet).**
With live popup/email-stats reads blocked this run (see Q4), I used the time
to build out Q2's one-off welcome email into a short 2-email sequence
instead of just re-checking the same numbers. Email #2 sends ~3 days after
signup, to anyone who hasn't made an outbound click yet — it explains
Street's actual model (discovery, not a store) to build trust and nudge a
first click. QA reviewed it against email #1's tone and Street's real
business model — approved as-is, no changes needed. Same hard block as Q2:
can't send until `BRAND_REPORTS_MAILING_ADDRESS` is set and Legal's Q1 is
answered.

> Subject: Street in 30 seconds: how it actually works
> Preview: We don't sell anything. Here's why that's the point.
>
> Hey —
>
> Quick one: Street isn't a store. It's where independent streetwear brands
> get discovered — browse, filter, compare, and when something's right, we
> send you straight to the brand's own site to buy it.
>
> No middleman, no markup, no dropshipping. Just the actual brand, your
> money straight to them.
>
> If a piece already caught your eye, go cop it. If not — [see what's new →]
> (streetdotcom.com)
>
> — Street
>
> ---
> Unsubscribe: {{unsubscribe_link}}
> {{mailing_address}}

**My recommendation:** approve as-is alongside Q2; both sit ready to send
as a sequence the moment Q1 clears.

**Q4 — this worktree (and analytics' too) is missing `.env.local`, blocking live DB reads.**
Normal Tier 1 checks (popup funnel events, `email_contacts` stats) read
these over the Supabase REST API using credentials from `.env.local`. That
file isn't present in this worktree right now — only `.env.example` is.
I also checked `.worktrees/analytics/`, same thing: no `.env.local` there
either, despite its own reports describing having used it. Both worktrees'
base files date to ~00:35-00:36 today, so this looks like a side effect of
however they got rebuilt then, not something specific to Growth: Lifecycle.
I also found and fixed a related but separate problem myself (Tier 1, local
git plumbing only): this worktree's `.git` pointer file and the main repo's
`.git/worktrees/growth-lifecycle/gitdir` file were both pointing at a stale
cloud-sandbox path instead of this machine's real path, which had silently
broken `git status`/`fetch`/`merge` here — likely since the same rebuild
event (explains the missing scheduled check-in around 09:04 today: it
produced an empty log, no entry in log.md). That part's fixed now and
confirmed working.
The missing env file I can't fix myself — I don't have the credential
values, and re-provisioning them across worktrees reads as an
Infrastructure/setup question, not a Growth: Lifecycle Tier 1 action.
**My recommendation:** copy `.env.local` (and `.env.ops.local` if any
department needs it) back into `.worktrees/growth-lifecycle/` and
`.worktrees/analytics/`, and maybe have Infrastructure look at why the
rebuild drops gitignored files that previously made it in — if this
happens again it'll quietly block every department's live-data checks
until someone notices.

## Answered

Format once answered: move the question under here with
`**Q:** ... **A:** ... (YYYY-MM-DD)`.
