// Per-department working directory resolution.
//
// Why this exists: every department session used to run inside the SAME
// checkout (the one Matthew has connected). The moment any one of them did
// a real `git checkout <branch>` to build something, it flipped the shared
// HEAD out from under every other concurrent session -- the GM chat, the
// app's own file reads, and every other department mid-run. That caused
// real collisions (lost-looking work, "npm error ENOENT" because the
// checkout had moved to a different branch mid-session, etc).
//
// The fix: give each department its own git worktree, living as a
// subdirectory of the already-connected folder
// (<repo>/.worktrees/<dept>/) -- so Matthew never has to connect a new
// folder and no trigger config changes. A worktree is a second, fully
// independent working directory backed by the same .git, so one
// department switching branches inside its own worktree never touches
// anyone else's files.
//
// This file does NOT create worktrees -- that's a one-time (or
// occasional) setup step run from the shared checkout itself
// (`git worktree add -b dept/<name>-base .worktrees/<name> work`).
// This just resolves, at run time, which directory a given department
// should actually run in: its own worktree if one exists, falling back
// to the shared repo root otherwise (so a department with no worktree
// yet still works exactly as before).
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

function hasWorktree(deptKey) {
  const candidate = path.join(REPO_ROOT, ".worktrees", deptKey);
  // A real git worktree has a `.git` file (not directory) pointing back at
  // the main repo's .git/worktrees/<name> -- that's how we tell "this is a
  // live, git-managed worktree" apart from a stray empty folder.
  return fs.existsSync(path.join(candidate, ".git"));
}

// Returns the directory a department's `claude -p` session should run in.
function deptWorkdir(deptKey) {
  const candidate = path.join(REPO_ROOT, ".worktrees", deptKey);
  return hasWorktree(deptKey) ? candidate : REPO_ROOT;
}

// Best-effort fast-forward refresh of the shared main checkout (REPO_ROOT)
// onto the latest origin/work. Departments now do their own work inside
// their own worktrees and push it back onto `work` themselves (see the
// auto check-in prompt in lib/claude-runner.js) -- this is what lets the
// GM's own chat session, which always reads hq/ files from REPO_ROOT, see
// that work without Matthew having to `git pull` by hand. Fast-forward
// only, so a dirty or diverged main checkout (which shouldn't normally
// happen now that departments aren't writing there directly) just means
// this is a no-op rather than something that could ever lose work.
function pullMainCheckout() {
  try {
    execFileSync("git", ["fetch", "origin", "work"], {
      cwd: REPO_ROOT,
      windowsHide: true,
      stdio: "ignore",
    });
    execFileSync("git", ["merge", "--ff-only", "origin/work"], {
      cwd: REPO_ROOT,
      windowsHide: true,
      stdio: "ignore",
    });
  } catch {
    // Best-effort -- swallow network hiccups, conflicts, or a dirty tree.
  }
}

module.exports = { REPO_ROOT, deptWorkdir, hasWorktree, pullMainCheckout };
