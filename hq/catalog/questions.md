# Questions for Matthew

## Open

**Q1 (2026-10-24):** Two recently onboarded brands have `catalog_enabled = false`
in the `brands` table and look stuck mid-onboarding rather than deliberately
held back: **Skyrat** (slug `skyratnyc`, added 2026-10-21, 174 products already
imported/classified) and **Emestudios** (slug `emestudios`, added 2026-10-14,
0 products, `metadata_synced_at` still null). Is this intentional (you're
holding them back until you review them in /admin/brands) or did onboarding
stall for Emestudios specifically (its catalog never got turned on/imported
at all)? My recommendation: if these are just waiting on your review, no
action needed from me; if Emestudios' import genuinely never ran, that's
worth a closer look at why (e.g. its storefront platform may not be the
Shopify-style `products.json` feed Street expects).

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

## Answered

Format once answered: move the question under here with
`**Q:** ... **A:** ... (YYYY-MM-DD)`.
