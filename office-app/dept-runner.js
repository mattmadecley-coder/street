#!/usr/bin/env node
// Detached worker: runs ONE department's Claude Code session to completion
// and keeps its status file up to date the whole way. Launched by
// mcp-server.js and left to run on its own -- it outlives that single GM
// turn, which is exactly what lets a department "work on it" in the
// background while Matthew keeps talking to the GM.
//
// Usage: node dept-runner.js <departmentKey> <taskFilePath>
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { getDepartment, REPO_ROOT } = require("./lib/departments");
const { writeStatus } = require("./lib/status-store");
const { resolveClaudeExe, buildDepartmentPrompt } = require("./lib/claude-runner");

const TIMEOUT_MS = 10 * 60 * 1000; // a department gets 10 minutes before we give up

async function main() {
  const [deptKey, taskFilePath] = process.argv.slice(2);
  if (!deptKey || !taskFilePath) {
    console.error("usage: dept-runner.js <departmentKey> <taskFilePath>");
    process.exit(1);
  }

  const dept = getDepartment(deptKey);
  if (!dept) {
    writeStatus(deptKey, { status: "error", summary: `Unknown department "${deptKey}"` });
    process.exit(1);
  }

  const task = fs.readFileSync(taskFilePath, "utf8");
  const startedAt = new Date().toISOString();
  writeStatus(dept.key, {
    displayName: dept.displayName,
    status: "working",
    task,
    startedAt,
  });

  const liveRunsDir = path.join(dept.hqDir, "live-runs");
  fs.mkdirSync(liveRunsDir, { recursive: true });
  const timestamp = startedAt.replace(/[:.]/g, "-");
  const logFile = path.join(liveRunsDir, `${timestamp}.log`);
  const errFile = path.join(liveRunsDir, `${timestamp}.err.log`);

  const prompt = buildDepartmentPrompt(dept.key, dept.agentFile, task);
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
    try {
      fs.unlinkSync(taskFilePath);
    } catch {
      // not fatal
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
