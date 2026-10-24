// Shared "launch a department" logic. Used by the MCP tool (a specific task
// from the GM/Matthew) and by the scheduler (a plain autonomous check-in,
// no task attached). Both paths end up spawning the same dept-runner.js as
// a detached background process so the department keeps working even after
// the thing that fired it (a single GM turn, or a scheduler tick) is done.
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { getDepartment, REPO_ROOT } = require("./departments");
const { writeStatus, readStatus } = require("./status-store");

const TMP_DIR = path.join(__dirname, "..", "tmp");

// Is this department already running (or stuck claiming to be, from a run
// that died without updating its own status -- e.g. the app got closed
// mid-run)? A real run finishes well inside dept-runner's own 10-minute
// timeout, so give it a generous 20 minutes before treating "working" as a
// stale lock rather than a real in-progress run.
const STALE_LOCK_MS = 20 * 60 * 1000;

function isBusy(deptKey) {
  const status = readStatus(deptKey);
  if (status.status !== "sent" && status.status !== "working") return false;
  const since = status.startedAt ? new Date(status.startedAt).getTime() : 0;
  return Date.now() - since < STALE_LOCK_MS;
}

// trigger: "manual" (GM fired it with a specific task) or "auto" (scheduler
// check-in, no task attached -- the department works its own goals.md).
function fireDepartment(deptKey, { task, trigger = "manual" } = {}) {
  const dept = getDepartment(deptKey);
  if (!dept) return { ok: false, error: `Unknown department "${deptKey}"` };
  if (isBusy(deptKey)) return { ok: false, error: `${dept.displayName} is already working.` };

  writeStatus(dept.key, {
    displayName: dept.displayName,
    status: "sent",
    task: task || null,
    trigger,
    startedAt: new Date().toISOString(),
  });

  const args = [path.join(__dirname, "..", "dept-runner.js"), dept.key];
  if (task) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    const taskFile = path.join(TMP_DIR, `${Date.now()}-${dept.key}.task.txt`);
    fs.writeFileSync(taskFile, task, "utf8");
    args.push("assigned", taskFile);
  } else {
    args.push("auto");
  }

  const child = spawn(process.execPath, args, {
    cwd: REPO_ROOT,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();

  return { ok: true, dept };
}

module.exports = { fireDepartment, isBusy };
