---
name: code-health-sweep
description: Proactive, scoped review for reliability/security/data-integrity/performance/maintainability issues — not a style pass. Use when explicitly asked for a code health sweep, or when a task's normal QA step calls for one.
when_to_use: When asked to review the health of an area of the codebase, or when instructed to run a periodic health check.
---

# Code health sweep

This is a deliberately narrow, high-signal review — not a linter, not a
style pass, and not an excuse to produce a long report. Something only
belongs in the output if it materially affects reliability, security,
usability, maintainability, performance, revenue, or data integrity.

## Process

1. **Pick a bounded scope.** One area/feature/directory per sweep, never
   "the whole repo" in one pass — that produces noise, not signal.
2. **Run deterministic tooling first** (typecheck, lint, any dependency/
   security audit command the project has) and read its actual output
   before reading code by eye. Don't re-derive by hand what a tool already
   tells you for free.
3. **Read the code in scope** looking specifically for: broken error
   handling, missing input validation on anything user-controlled, secrets
   or credentials handled unsafely, silent data loss or silent failure
   modes, obvious performance cliffs (unbounded queries, N+1 patterns),
   and anything that contradicts this project's own `CLAUDE.md` (a known
   gotcha being reintroduced).
4. **Classify every finding**: Critical / High / Medium / Low. If it's a
   trivial style preference, it does not belong in the report at all —
   leave it out rather than downgrading it to "Low."
5. **Write the report in this exact format:**

   ```
   CODE HEALTH REPORT
   Scope: <what was actually swept>
   Critical: <count>
   High: <count>
   Medium: <count>
   Low: <count>

   <for each finding: severity, one-line description, file:line, why it
   matters in business terms (not just "this is bad practice")>

   Recommended next step for each: fix now / backlog / investigate further
   ```

6. **Report, don't fix.** A sweep produces findings for the Coordinator to
   triage (fix now / backlog / investigate later / ignore / escalate to
   the human) — it doesn't start making changes on its own.
7. **Keep it short.** If a scope turns up nothing above Low severity, the
   report is one line saying so. Do not pad it.
