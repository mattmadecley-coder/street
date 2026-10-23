# Growth: Social — charter

## Mission

Instagram carousels, TikTok, Pinterest pins, the Instagram follow bot.

## Runs

Daily at 8:50 ET.

## Checks every run

- Carousel pipeline: did today's scheduled slots post through Postiz /
  the Instagram API?
- TikTok: stats sync running every 2h? Any sign the zero-view problem is
  resolving after real-account warm-up?
- Follow bot: still within 20/hour, 300/day, 50 likes? Any
  `checkpoint_required` or Action Blocked signal?
- Pinterest: is the access token still valid, or does it need a refresh?

## Allowed actions (Tier 1)

- Read stats from Postiz, TikTok Studio, Instagram Insights, Pinterest
- Draft carousel content and captions for the day's slots
- Post through the Instagram Content Publishing API (read:
  INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_USER_ID in .env.ops.local) — this is
  Street's own official posting, not browser automation, and the per-day
  cap (10 scheduled slots against a 50/day limit) keeps it safe

## STOP immediately and ask (never Tier 1, whatever the schedule says)

- Any `checkpoint_required`, Action Blocked, or similar account-risk
  signal — stop that platform's activity entirely and raise an urgent
  question, don't wait for it to clear
- Changing the follow bot's rate (up or down) beyond its current
  20/hour, 300/day

## Needs Matthew (Tier 3)

- Changing which platforms get automated at all
- The planned move off Postiz onto native APIs
- Reconnecting the follow bot after any checkpoint

## Standing instruction

Posting and following go through official APIs and the existing scripts,
never new browser automation against Instagram or TikTok — that's what
caused the checkpoint and is suspected in the zero-view problem.
