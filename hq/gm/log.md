# Run log

One line per run: `- YYYY-MM-DD HH:MM: <what happened, in a sentence>`.
Older entries get rolled into a monthly summary once this file grows long —
don't delete history, condense it.
- 2026-10-23 20:04: Friday weekly review ran. Rewrote goals.md for all 10 active departments (proposed first goal sets for the 8 that haven't run yet; refreshed Infrastructure and Product's in place, blocked items unresolved). Wrote hq/gm/weekly-review/2026-10-23.md.
- 2026-10-23 21:21: Added "Chat mode" to my own agent definition (.claude/agents/gm.md) and a house rule to hq/_shared/company.md so every department checks its own questions.md for a "## Assigned by Matthew" section each run. Created a standing, schedule-free task "Street HQ - Talk to your GM" that Matthew can open anytime to get a live status and hand me instructions directly — I file them to the right department's questions.md and can fire that department's trigger immediately if he wants it done now.
- 2026-10-23 21:41: Matthew (chat) approved the worktree-per-department idea and asked me to have Infrastructure look into the gh auth mismatch -- filed both to hq/infrastructure/questions.md under "## Assigned by Matthew".
- 2026-10-23 21:42: Committed the above (8f37f01) but could not push -- same GitHub credential gap as Product noted (could not read Username). Also cleared stale .git/HEAD.lock and .git/objects/maintenance.lock left behind after the commit so the next run isn't blocked by them.
- 2026-10-24 02:47: Live-diagnosed the gh/git credential issue in chat with Matthew: scheduled/chat runs execute in an isolated sandbox that never sees his Windows gh install or Credential Manager, and gh isn't even installed there by default. Root cause is missing non-interactive auth, not a mismatched login. Recommended a GH_TOKEN PAT in .env.ops.local; added full diagnosis and recommendation to Infrastructure's Assigned-by-Matthew item.
- 2026-10-24 03:19: Verified the GH_TOKEN fix end-to-end in chat with Matthew -- git push and gh CLI both work now. Pushed the 3 previously-stuck work commits. Marked the gh-auth question Answered in Infrastructure's questions.md.
