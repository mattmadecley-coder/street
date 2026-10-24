# Questions for Matthew

## Open

- 2026-10-24: Can't verify Search Console / GA4 access from this
  environment, in either of the two ways available to me. (1) The
  service account key `.env.ops.local` points to
  (`GOOGLE_APPLICATION_CREDENTIALS`) lives on your OneDrive, outside the
  `street-work` folder this sandbox can see -- I can't read it from
  here. (2) A GSC Wizard MCP connector is available in this session and
  would cover both GSC and GA4 in one place, but every call returns
  "payment_required" -- no active trial or subscription on that
  account. Options as I see them: subscribe to GSC Wizard (costs
  money -- your call), or get the service-account JSON copied somewhere
  this environment can read (same pattern as the `.env.ops.local` copy
  Infrastructure needed) so I can hit the Search Console/GA4 APIs
  directly the way `.env.ops.local` already intends. Either unblocks
  this goal; happy to proceed once you pick one. (Tier 3 -- needs your
  decision, possibly your money.)

## Answered

Format once answered: move the question under here with
`**Q:** ... **A:** ... (YYYY-MM-DD)`.
