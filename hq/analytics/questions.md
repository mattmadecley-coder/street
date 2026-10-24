# Questions for Matthew

## Open

- 2026-10-24 update: Confirmed via chat that the credentials are
  already configured, exactly as Matthew expected -- `.env.ops.local`
  does have `GA4_PROPERTY_ID` and `GOOGLE_APPLICATION_CREDENTIALS` set.
  The gap isn't a missing env var, it's that `GOOGLE_APPLICATION_CREDENTIALS`
  is a file path (`C:\Users\mattm\OneDrive\Documents\street-secrets\
  new-project-496518-7ef47606461b.json`) pointing at a file on OneDrive,
  outside the `street-work` folder this sandbox can mount -- same shape
  of problem as Infrastructure's original `.env.ops.local`-missing
  issue, one level deeper. The GM requested access to that OneDrive
  folder from Matthew's device on 2026-10-24 to copy the JSON key into
  `street-work` (gitignored) and point the env var at the copy; pending
  his approval of that folder-access prompt. Once that's done this
  should just work -- no GSC Wizard subscription needed.

## Answered

Format once answered: move the question under here with
`**Q:** ... **A:** ... (YYYY-MM-DD)`.
