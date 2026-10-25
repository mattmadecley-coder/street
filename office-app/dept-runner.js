#!/usr/bin/env node
// Detached worker: runs ONE department's Claude Code session to completion
// and keeps its status file up to date the whole way. Launched either by
// lib/fire.js for a specific task from the GM, or by lib/scheduler.js for a
// plain check-in. Either way it outlives whatever fired it -- that's what
// lets a department "work on it" in the background, including the
// continuous, self-directed check-ins Matthew asked for.
//
// Usage:
//   node dept-runner.js <departmentKey> assigned <taskFilePath>
//   node dept-runner.js <departmentKey> auto
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { getDepartment } = require("./lib/departments");
const { writeStatus } = require("./lib/status-store");
const {
  resolveClaudeExe,
  buildDepartmentPrompt,
  buildAutoCheckinPrompt,
} = require("./lib/claude-runner");

const TIMEOUT_MS = 15 * 60 * 1000; // a department gets 15 minutes before we give up -- bumped from 10 once real multi-step work started regularly running close to the old limit

async function main() {
  const [deptKey, mode, taskFilePath] = process.argv.slice(2);
  if (!deptKey || (mode !== "assigned" && mode !== "auto")) {
    console.error("usage: dept-runner.js <departmentKey> assigned <taskFilePath> | auto");
    process.exit(1);
  }

  const dept = getDepartment(deptKey);
  if (!dept) {
    writeStatus(deptKey, { status: "error", summary: `Unknown department "${deptKey}"` });
    process.exit(1);
  }

  const task = mode === "assigned" ? fs.readFileSync(taskFilePath, "utf8") : null;
  const startedAt = new Date().toISOString();
  writeStatus(dept.key, {
    displayName: dept.displayName,
    status: "working",
    task,
    trigger: mode === "auto" ? "auto" : "manual",
    startedAt,
  });

  const liveRunsDir = path.join(dept.hqDir, "live-runs");
  fs.mkdirSync(liveRunsDir, { recursive: true });
  const timestamp = startedAt.replace(/[:.]/g, "-");
  const logFile = path.join(liveRunsDir, `${timestamp}.log`);
  const errFile = path.join(liveRunsDir, `${timestamp}.err.log`);

  const prompt =
    mode === "assigned"
      ? buildDepartmentPrompt(dept.key, dept.agentFile, task)
      : buildAutoCheckinPrompt(dept.key, dept.agentFile);
  const { exe, useShell } = resolveClaudeExe();
  const args = ["-p", prompt, "--dangerously-skip-permissions"];

  const outStream = fs.createWriteStream(logFile, { flags: "a" });
  const errStream = fs.createWriteStream(errFile, { flags: "a" });

  // Run inside the department's OWN git worktree when it has one, so a
  // department doing a real `git checkout` to build something never flips
  // the branch out from under the GM chat, the app itself, or any other
  // department's concurrent session.
  const child = spawn(exe, args, {
    cwd: dept.cwd,
    shell: useShell,
    windowsHide: true,
  });

  // We killed this ourselves via timeout -- not "the department errored",
  // just "ran out of time". Only the close handler below decides the final
  // status (see freshSummary) -- this just remembers why, if it comes to that.
  let killedForTimeout = false;
  const timer = setTimeout(() => {
    killedForTimeout = true;
    child.kill();
  }, TIMEOUT_MS);

  child.stdout.pipe(outStream);
  child.stderr.pipe(errStream);

  child.on("error", (err) => {
    clearTimeout(timer);
    writeStatus(dept.key, {
      status: "error",
      summary: `Could not launch claude: ${err.message}`,
      finishedAt: new Date().toISOString(),
    });
  });

  child.on("close", (exitCode) => {
    clearTimeout(timer);
    // A clean exit (0) is a real success. A kill from our own timeout is
    // ALSO a real success if the department had already written fresh
    // output before we killed it -- that's a department that finished its
    // actual work and was just slow to exit cleanly afterward, not one
    // that failed. Anything else (a genuine crash, or a timeout with
    // nothing fresh written) is an error.
    const fresh = freshSummary(dept, startedAt);
    const succeeded = exitCode === 0 || (killedForTimeout && fresh);
    const summary =
      fresh ||
      (exitCode === 0
        ? "Finished -- no summary line found in log.md."
        : killedForTimeout
        ? `Ran out of time after ${Math.round(TIMEOUT_MS / 60000)} minutes -- check live-runs for details.`
        : "Exited with an error -- see live-runs log.");
    writeStatus(dept.key, {
      status: succeeded ? "done" : "error",
      exitCode,
      summary,
      finishedAt: new Date().toISOString(),
    });
    if (taskFilePath) {
      try {
        fs.unlinkSync(taskFilePath);
      } catch {
        // not fatal
      }
    }
  });
}

// What Matthew actually sees for this run: the one-line, plain-English
// headline the department is instructed to overwrite in status-line.md
// each run, falling back to the technical log.md line if that file is
// missing (e.g. an older department worktree that hasn't picked up the
// new instructions yet) or wasn't written yet in the time it had. Either
// way, only counts if it was actually written DURING this run (its mtime
// is after startedAt) -- otherwise it's just a stale leftover from a
// previous run, not real output from this one.
function freshSummary(dept, startedAt) {
  const startMs = new Date(startedAt).getTime();
  const headline = freshFileFirstLine(path.join(dept.hqDir, "status-line.md"), startMs);
  if (headline) return headline;
  return freshFileFirstLine(path.join(dept.hqDir, "log.md"), startMs, lastLogLine);
}

function freshFileFirstLine(filePath, startMs, extract) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.mtimeMs < startMs) return null; // not touched this run -- stale
    if (extract) return extract(filePath);
    const raw = fs.readFileSync(filePath, "utf8").trim();
    return raw.split(/\r?\n/)[0] || null;
  } catch {
    return null;
  }
}

function lastLogLine(logPath) {
  try {
    const raw = fs.readFileSync(logPath, "utf8");
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().startsWith("-"));
    return lines.length ? lines[lines.length - 1].replace(/^-\s*/, "") : null;
  } catch {
    return null;
  }
}

main();
