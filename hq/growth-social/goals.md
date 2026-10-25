# This week's goals

Format: `- [ ] <goal>` or `- [x] <goal> (done YYYY-MM-DD)` or
`- [~] <goal> (blocked: <why>)`. Rewritten by the GM each Friday after the
weekly review; a department can add a goal mid-week if something real comes
up, but shouldn't remove one Matthew hasn't seen moved.

- [x] First run: check whether today's carousel pipeline (Postiz/Instagram
  API) actually posted its scheduled slots (done 2026-10-24 -- correction at
  15:32: 2 of today's 10 slots turned out stuck in draft, see the item below)
- [~] Check TikTok stats-sync cadence and whether the zero-view problem is
  improving as the account warms up (sync cadence confirmed healthy 2026-10-24; zero-view problem not yet improving -- last 5 posts still 0-3 views each, and TikTok posting is currently paused)
- [x] Confirm the follow bot is within its 20/hour, 300/day, 50-likes caps
  with no checkpoint/Action Blocked signal (done 2026-10-24 15:32 -- bot resumed
  on its own at 13:58 UTC after the 6-day stall; 13 follows logged today, within
  caps, no checkpoint signal; root cause of the stall still unconfirmed, left
  as a non-urgent follow-up in questions.md)
- [~] Today's Instagram carousel pipeline (added 2026-10-24 15:32, diagnosed
  further 2026-10-24 16:21, confirmed forward-looking 2026-10-24 18:46):
  confirmed via Postiz's own post list that this is a repeating pattern, not
  2 random failures -- every single half-hour-mark slot today (01:30, 13:30,
  16:30, 19:30, 22:30, 5/5) sits in DRAFT, while every on-the-hour slot
  posted or is correctly queued. Looks like the carousel-scheduling script
  assigns the wrong Postiz post type to every other slot (parity bug), not
  an account/token/posting problem. Re-checked through 2026-10-26: all 5 of
  tomorrow's half-hour slots are already DRAFT too -- this is being baked
  into every future day's schedule, not a one-off. (blocked: fixing the
  script is outside this folder/charter -- flagged for Product in
  questions.md, did not manually convert or repost the drafts)
- [x] Confirm the Pinterest access token is still valid (done 2026-10-24 -- last scheduled run succeeded 09:00 UTC today)
- [x] Test posting a carousel directly through the Instagram Content Publishing API instead of Postiz, per Matthew's approval to start moving off Postiz (added 2026-10-24, blocked through several rounds on a bad/mismatched token and a wrong-host/wrong-user-id pairing -- see prior entries; done 2026-10-24: Matthew updated INSTAGRAM_USER_ID to 28859877116998079 and confirmed the posting path should target graph.instagram.com; ran GET /me as the debug_token-equivalent read first -- clean, resolved to the correct account (streetdotcomstreetwear); got QA approval on a 2-image test carousel reusing already-published/approved product photos; created both item containers, the carousel container, and published live -- https://www.instagram.com/p/De4w5MDmoKv/, media id 18373677466300438. The native-API migration path is now confirmed working end-to-end. One minor non-blocking finding logged in questions.md: the caption's em dash rendered as a replacement character in the live post, a UTF-8 encoding issue somewhere in the POST pipeline, not an API/auth problem.)
