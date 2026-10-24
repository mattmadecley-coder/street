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

There's now an actual desktop app on top of this -- see section 6 below
for the one-time setup. The terminal above still works exactly the same
way if you ever just want to talk to the GM directly.

## 6. The Street HQ desktop app (one-time setup)

This is the actual app: one window, a chat with the GM on one side, your
departments listed on the other with a live status dot. It runs on the
exact same local `claude` you just signed into above -- there's no API
key anywhere in it, so there's no extra cost beyond the subscription you
already have.

```
cd C:\Users\mattm\Documents\street-work\office-app
npm install
npm start
```

The first `npm install` will take a minute (it's downloading Electron).
After that, `npm start` opens the app. Leave the terminal window open
while the app is running -- closing it closes the app too.

Try it: type something like "what's the status of infrastructure?" and
the GM should answer from the real hq/infrastructure files. Then try
something that should actually get done, e.g. "ask infrastructure to
check the site is up and log it" -- you should see a line appear in the
chat like "-> Sent to Infrastructure HQ", then "... Infrastructure HQ is
working", then "Infrastructure HQ replied: ...". The matching department
card on the right will show the same thing as a colored dot (gray = idle,
amber = working, green = done, red = needs attention).

If `npm start` errors out, paste the error into a `claude` session in
this same folder (or back to me) -- it'll very likely be something
platform-specific like the Windows launch-path bug that came up testing
`fire-department.ps1`, and it gets fixed the same way: read the error,
patch the file, try again.

Nothing about how departments actually work changed -- same Tier 1/2/3
rules, same file-based reporting, same "## Assigned by Matthew" (or now
"## Assigned by GM" when the app itself sends the task) convention in
each department's questions.md. The app is just a friendlier front door
onto all of that.

### Departments clock in and keep working on their own

While the app is open, every department (except QA, which is reactive by
design) clocks itself in and checks in again every 2 hours, 9am-5pm, on
its own -- no task from you required. Each check-in is the same as a
normal run: it looks for anything assigned in its questions.md first,
does its usual Tier 1 checks, and if nothing's urgent it picks the next
item off its own goals.md and makes real progress on it, logging what it
did (or logging "nothing new this check-in" if there's genuinely nothing
to do). You'll see these in the chat as "X HQ clocking in" / "X HQ
checking in on its own work", same status dots as anything else.

This only runs while the app itself is open on this machine -- close it
and departments stop working until you open it again. There's a
"Clocked in" toggle at the bottom of the department list if you want to
pause all of this (e.g. to stop a run mid-task, or just go quiet for a
while) without closing the app; flip it back and the next check-in
happens on the following poll.
