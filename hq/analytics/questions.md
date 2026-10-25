# Questions for Matthew

## Open

(none)

## Answered

Format once answered: move the question under here with
`**Q:** ... **A:** ... (YYYY-MM-DD)`.

- **Q:** Could GA4/Search Console service-account access be made to work
  from this environment? **A:** Resolved 2026-10-24 -- the JSON key now
  lives at `street-secrets/new-project-496518-7ef47606461b.json` inside
  `street-work` (gitignored) and `.env.ops.local`'s
  `GOOGLE_APPLICATION_CREDENTIALS` points at it. Verified this run: signed
  a JWT with the key, got a valid OAuth token, and successfully called
  both the GA4 Data API (`runReport`, property 376575603) and the Search
  Console API (`sites.list` + `searchAnalytics.query` for
  `sc-domain:streetdotcom.com`) end to end. No GSC Wizard subscription
  needed. (2026-10-24)
