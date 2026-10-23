# Questions for Matthew

## Open

**Q:** `git` doesn't work at all in `street-work` from this agent's sandbox
(not just `gh`) -- can we make `street-work` a standalone clone instead of
a worktree of `street`, so Product's runs can actually branch/commit/push?

Today's run found the root cause: `street-work/.git` is a worktree pointer
file reading `gitdir: C:/Users/mattm/Documents/street/.git/worktrees/street-work`.
That path lives in the *other* checkout (`street`, not `street-work`), and
this agent's shell is a sandboxed Linux VM with no access to Windows
drive-letter paths at all -- not even if `street` were also connected as a
folder, since `C:/...` can never resolve inside it. So every `git` command
fails, every run, with no way to branch, commit, or push. This is very
likely the same cause Infrastructure's first run hit today with `gh auth
status` and a missing repo remote URL (see
`hq/infrastructure/reports/2026-10-23.md`) -- worth treating as one root
cause, not two separate mysteries.

**Recommendation:** give `street-work` its own `.git` (a real clone of
the `street-work` branch's history, with `origin` configured), instead of
it being a worktree of `street`. That makes git self-contained inside the
one connected folder, which is what every department's agent actually has
access to. I did not attempt this myself -- it touches repo plumbing, not
application code, and a mistake here risks the real history.

Until this is fixed, I can draft and review code but can't open a PR for
it -- see `hq/product/drafts/office-page/` for today's finished, ready-to-
apply draft of the `/admin/hq` office page.

**Update, second run same day:** re-confirmed the blocker from scratch --
unchanged, `gh` isn't even on `PATH` in this environment. Used the wait
productively instead: cross-checked the draft against the live codebase
file-by-file (no drift found) and ran it through an independent QA review
against `hq/qa/charter.md`. QA sent it back once for a real gap (a missing
auth check in one page's `generateMetadata`), which is now fixed and
re-approved. The draft needs zero further work -- the only thing standing
between it and shipping is this git/gh access question.

## Answered

**Q:** `git` doesn't work at all in `street-work` from this agent's
sandbox (not just `gh`) -- can we make `street-work` a standalone clone
instead of a worktree of `street`? **A:** Yes, done. `street-work` is now
a real standalone clone with its own `.git`, `origin` remote, and local
git identity configured -- the old worktree is preserved untouched at
`street-work-old` as a safety net until Matthew deletes it himself. Git
and `gh` both work from this sandbox now. The office-page draft was
applied on top of this fix: branch `agent/hq-office-page-v2`, pushed, PR
opened at https://github.com/mattmadecley-coder/street/pull/49 against
`work`. (2026-10-23)

Format once answered: move the question under here with
`**Q:** ... **A:** ... (YYYY-MM-DD)`.
