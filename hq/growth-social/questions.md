# Questions for Matthew

## Open

- **URGENT -- Instagram follow bot reports "running" but has made zero follows in 137h (since 2026-10-18T19:24 UTC, ~6 days ago).** `automation_jobs.ig_follow_bot` shows `last_status: "stale"`, `last_message: "Running but no follow in 137h"`, `details.running: true`. Cross-checked against `ig_follow_log` -- its newest row is the exact same timestamp (2026-10-18T19:24:18), confirming this isn't a dashboard-lag artifact: no actual follow activity has happened in 6 days. Caps on file: 20/hour, 300/day, 50 likes/day, 25 target accounts, unfollow after 5 days, unfollow enabled, 1 restart logged in the last 7 days (roughly lining up with when it went quiet). This isn't a literal `checkpoint_required`/"Action Blocked" string in anything I can see, so I'm not certain it's an account block -- but a bot that reports itself as actively running while doing nothing for 6 days is exactly the kind of silent-failure pattern that could mean it hit an undetected soft block/shadow-restriction on follows, or crashed without the process supervisor noticing. I have no visibility into the bot's own process or logs from this session: it runs on your PC outside the `street-work` folder this department's scheduled task is connected to, and I found no invocable script for it inside this repo to check further. Flagging rather than guessing or restarting it myself (changing the follow bot's rate or reconnecting it after a possible checkpoint is Tier 3 either way). Recommend checking the bot process directly on your machine -- is it actually alive, and does its own log show an error or a block around 2026-10-18T19:24? (2026-10-24, urgent)

## Answered

Format once answered: move the question under here with
`**Q:** ... **A:** ... (YYYY-MM-DD)`.
