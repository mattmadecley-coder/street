---
name: fire-department
description: Fire a Street HQ department as its own standalone local Claude Code session right now, instead of waiting for its scheduled run or just filing a question. Use when Matthew gives GM a direct instruction in chat and wants it acted on immediately, or when GM itself judges a department needs to act before its next scheduled run.
---

# Firing a department right now

You are running locally (Claude Code directly on Matthew's own PC), so you
have an option a cloud/Cowork session never had reliably: you can launch a
department's own Claude Code session as a detached, hidden background
process with full local access -- no device bridge, no approval gate, no
waiting for its cron schedule.

## When to use this

- Matthew gives you (GM) a direct instruction meant for a specific
  department and says, or clearly means, "do this now" / "right away" --
  not just "whenever it gets to it."
- You (GM) judge, on your own, that something needs a department's
  attention before its next scheduled run (an urgent question came in, a
  blocking issue was found).
- Not for routine work that can just wait for the department's normal
  schedule -- firing it live spends real compute right now; don't reach
  for this reflexively for everything.

## How to use it

1. Work out which department the instruction belongs to (read its
   hq/<dept>/charter.md if you're not sure which one owns it).
2. Still log the instruction the normal way first: append it to
   hq/<dept>/questions.md under "## Assigned by Matthew" (create the
   heading if it isn't there yet) and log.md, exactly as your own agent
   definition's chat-mode instructions already describe. This keeps the
   file record intact even though you're also firing it live.
3. Run the firing script with your Bash tool:

   powershell -File scripts/fire-department.ps1 -Department <dept> -Task "<task in your own words>"

   `<dept>` must be one of the keys in scripts/departments.json (gm,
   analytics, catalog, finance, growth-lifecycle, growth-seo,
   growth-social, infrastructure, legal, partnerships, product, qa).
4. Tell Matthew it's firing now, where its log will land
   (hq/<dept>/live-runs/<timestamp>.log for raw output, hq/<dept>/log.md
   and questions.md for the normal report), and that it runs
   independently -- he doesn't need to wait inside this conversation for
   it to finish.
5. Don't fire the same instruction twice. If you already fired it this
   session, say so instead of firing it again.

## What this does NOT change

Firing locally removes the TECHNICAL friction (no cloud trigger, no
device-bridge approval), not the department's own Tier 1/2/3 rules from
its charter. A fired department that hits something needing Matthew's
approval still stops and writes it to questions.md, exactly as it would
on a normal scheduled run. "Full local access" means no technical
barrier stops it -- it is not permission to skip its own approval rules.
