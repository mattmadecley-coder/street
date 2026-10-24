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
const { getDepartment, REPO_ROOT } = require("./lib/departments");
const { writeStatus } = require("./lib/status-store");
const {
  resolveClaudeExe,
  buildDepartmentPrompt,
  buildAutoCheckinPrompt,
} = require("./lib/claude-runner");

const TIMEOUT_MS = 10 * 60 * 1000; // a department gets 10 minutes before we give up

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

  const child = spawn(exe, args, {
    cwd: REPO_ROOT,
    shell: useShell,
    windowsHide: true,
  });

  const timer = setTimeout(() => {
    child.kill();
    writeStatus(dept.key, {
      status: "error",
      summary: "Timed out after 10 minutes -- check live-runs for details.",
      finishedAt: new Date().toISOString(),
    });
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
    const summary =
      lastLogLine(dept.hqDir) ||
      (exitCode === 0
        ? "Finished -- no summary line found in log.md."
        : "Exited with an error -- see live-runs log.");
    writeStatus(dept.key, {
      status: exitCode === 0 ? "done" : "error",
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

function lastLogLine(hqDir) {
  try {
    const raw = fs.readFileSync(path.join(hqDir, "log.md"), "utf8");
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().startsWith("-"));
    return lines.length ? lines[lines.length - 1].replace(/^-\s*/, "") : null;
  } catch {
    return null;
  }
}

main();
