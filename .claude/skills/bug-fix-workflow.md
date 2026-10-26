---
name: bug-fix-workflow
description: Standard process for implementing a bug fix or a scoped feature change. Use this for any normal implementation task so the same disciplined process runs every time instead of being re-described in every agent prompt.
when_to_use: Any time you are asked to fix a bug or implement a scoped change to application code.
---

# Bug fix / scoped change workflow

This is the default process. It exists so every implementer follows the same
discipline without the steps being re-typed into every agent's own prompt.

1. **Understand the request.** Read the specific files/routes involved — not
   the whole project. Check this project's `CLAUDE.md` for anything relevant
   (known gotchas, architecture notes, prior incidents in this area) before
   touching code.
2. **Confirm the problem is real** where that's possible — reproduce it,
   don't assume the report is accurate. If it can't be reproduced, say so
   before proceeding rather than guessing at a fix.
3. **Implement the minimal, scoped change.** Touch only what the task
   requires. Do not fold in unrelated cleanup, refactors, or "while I'm here"
   changes — flag those separately instead (see the code-health-sweep skill
   for how to classify anything unrelated you notice).
4. **Run the deterministic checks that apply** — typecheck, lint, build,
   and tests if the change touches tested code. Do this yourself; never
   report a check "passed" without having actually run it.
5. **Verify in a way that matches the change:**
   - UI change: verify visually and functionally in a real browser if a
     browser tool is available, not just by reading the code.
   - Backend/API/server-function change: call it or check logs to confirm
     the actual behavior, not just that it compiles.
   - Database/migration change: confirm the migration actually applied and
     check real data afterward — never assume success.
   - Anything payment- or money-adjacent: test only with the provider's
     test mode / test data. Never a real charge or real funds.
6. **Check the diff is scoped.** Read your own diff before reporting done.
   No unrelated files, no accidental formatting-only churn on untouched
   lines.
7. **Report clearly**: what was wrong, what changed, what was actually
   tested and its result, anything unrelated you noticed along the way
   (classified per code-health-sweep), and anything that needs a human
   decision. Don't pad the report with routine implementation narration.
