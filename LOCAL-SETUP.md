# Running Street HQ locally (one-time setup)

This is the piece Claude couldn't do for you from the chat bridge -- that
bridge runs in a restricted sandbox on purpose (no root, no unrestricted
Claude Code), so it can write files into this folder but can't launch a
real, full-access local Claude Code session. These steps need to happen
once, at your own keyboard, in a real terminal.

## 1. Install Claude Code, if you haven't already

```
npm install -g @anthropic-ai/claude-code
```

(Requires Node.js -- if you don't have it, get the LTS installer from
nodejs.org first.)

## 2. Sign in once, interactively

```
cd C:\Users\mattm\Documents\street-work
claude
```

Sign in with your normal Claude account when it prompts -- same
subscription you already pay for, nothing new to buy. This step has to be
interactive once; after that, scripted/background runs reuse the saved
login.

Try asking it something simple to confirm it's working, e.g. "read
hq/_shared/company.md and tell me what Street is."

## 3. (Optional but recommended) Pre-install Playwright's browser

The project's `.mcp.json` already wires up a Playwright MCP server so any
department session can drive a real browser. The first time it's used it
will try to download Chromium automatically; to avoid that happening
mid-task, you can do it once yourself:

```
npx -y playwright install chromium
```

## 4. Test firing a department locally

From a normal PowerShell window (not inside a `claude` session):

```
cd C:\Users\mattm\Documents\street-work
.\scripts\fire-department.ps1 -Department infrastructure -Task "Local-fire test: just confirm you can read your charter and append one line to log.md, then stop."
```

This launches Infrastructure's own Claude Code session in the background,
with full access to this machine (it runs with
`--dangerously-skip-permissions` -- that's what "full access" actually
means: Claude Code won't stop to ask before reading/writing files or
running commands, which is the whole point of running departments
unattended, but it's also why it's worth running a small test like this
one first).

Check on it after a minute or two:

```
type hq\infrastructure\live-runs\*.log | more
type hq\infrastructure\log.md
```

If `log.md` has a new line and the live-run log shows it read its charter
and did something sensible, it's working end to end.

## 5. Day-to-day: talk to the GM locally

```
cd C:\Users\mattm\Documents\street-work
claude
```

This is now your real "virtual office" front door -- a live Claude Code
session that has read `.claude/agents/gm.md` and can read any department's
files, fire a department immediately via the `fire-department` skill when
you need something done right now, or just talk through what's going on.
It has the exact same house rules and Tier 1/2/3 approval boundaries as
the cloud version always did -- running locally removes the access
problems, not the guardrails.

A nicer UI on top of this terminal (so it feels like an actual app instead
of a terminal window) is a separate, later step -- the mechanism above is
the part that actually needed to work first.
