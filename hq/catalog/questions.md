# Questions for Matthew

## Open

**Q1 (2026-10-24, updated 2026-10-25):** This is bigger than the 2 brands I
first flagged. Full audit of `catalog_enabled = false` today found **9**
brands total, all created between 2026-09-29 and 2026-10-21 (nothing older
is disabled):

| brand (slug) | added | products imported | storefront |
|---|---|---|---|
| Pholoh (`pholoh`) | 2026-10-10 | 240 | open |
| Skyrat (`skyratnyc`) | 2026-10-21 | 174 | open |
| VSZN (`vsznclothing`) | 2026-09-29 | 70 | open |
| Side Arts (`sidearts-fr`) | 2026-10-04 | 66 | open |
| PiecesOfKnowledge (`piecesofknowledge`) | 2026-10-14 | 41 | open |
| Flaire Studios (`flairestudios`) | 2026-10-04 | 14 | open |
| Weuncomfortable (`weuncomfortable`) | 2026-10-04 | 3 | open |
| Hourscollection (`hourscollection`) | 2026-10-04 | 1 | **403 (blocked)** |
| Emestudios (`emestudios`) | 2026-10-14 | 0 | open |

7 of these 9 have real product data sitting fully imported and classified
but invisible to shoppers because `catalog_enabled` is still false. (I
initially suspected a stuck `metadata_synced_at` sync step, but checked
and ruled that out — plenty of brands with `catalog_enabled = true`,
including some onboarded this same month, also have a null
`metadata_synced_at`, so that column isn't the differentiator.)
Hourscollection is a separate problem from the other 8 — its storefront is
actively blocking Street's fetches with HTTP 403, so it has almost nothing
imported regardless of the enabled flag.

Is holding all 9 back deliberate (you review each in /admin/brands before
flipping it live) or should most of these — especially Pholoh at 240
products — already be live and something in onboarding just isn't
flipping the switch? My recommendation: if it's deliberate, no action
needed and I'll stop re-flagging brands that fit this "onboarded in the
last month, not yet enabled" pattern; if it's not, it's worth a closer
look at whatever step is supposed to flip `catalog_enabled` to true (I
don't have visibility into that pipeline from Catalog's data tools).

**Q2 (2026-10-24):** Of the 35 `needs_review` products, I confidently fixed 3
(a cargo-pants detail, two polo details) and left 32 alone. Most of those 32
aren't really apparel at all — gift cards, "Mystery Box" entries, test rows
("test product 1", "ytyjyj", "Untitled Nov3_22:30"), and a handful of odd
non-catalog items pulled in from brand feeds (a notebook, a chain necklace, a
lighter, condoms, a flag tapestry, a carpet, a spray bottle, a backgammon set,
a "Bladder Buddy Cystoscope"). These aren't a classification problem I can
fix with a taxonomy override — they're candidates for hiding from the
catalog entirely. My recommendation: let me hide the clear non-product/test
rows (via the existing hide action, reversible) next run if you'd rather not
review the list yourself first — just say go ahead, or I'll leave them as
they are.

**Q3 (2026-10-25):** The homepage feature schedule (`homepage_feature_schedule`)
only has 2 rows total: Named Collective (started 2026-07-27) and Broken
Planet (started 2026-09-28, still the active one today, 27 days running).
Nothing is queued to take over next, so Broken Planet stays featured
indefinitely until someone adds a new row. I didn't schedule a replacement
myself since picking which brand gets the homepage spotlight felt like your
call, not a data-fix call. My recommendation: tell me your rotation cadence
(weekly/monthly/no fixed schedule) and whether you want me to propose
candidates (active, catalog_enabled brands with a strong product count and
real brand imagery) each time the active row is close to its cadence, or if
you'd rather pick/schedule these yourself in /admin.

## Answered

Format once answered: move the question under here with
`**Q:** ... **A:** ... (YYYY-MM-DD)`.
