// Tiny shared "database": one JSON file per department under office-app/status/.
// Both the MCP tool (short-lived, one per GM turn) and the detached dept-runner
// process write to these files; main.js (long-lived, always running while the
// app is open) watches this folder and pushes updates to the UI. This is the
// whole mechanism behind the "Sent to X HQ" / "X HQ is working" / "X HQ
// replied" status you see in the app -- it never depends on parsing the GM's
// own chat output, so it keeps working no matter what the GM says.
const fs = require("fs");
const path = require("path");

const STATUS_DIR = path.join(__dirname, "..", "status");

function ensureDir() {
  if (!fs.existsSync(STATUS_DIR)) fs.mkdirSync(STATUS_DIR, { recursive: true });
}

function statusPath(dept) {
  return path.join(STATUS_DIR, `${dept}.json`);
}

function readStatus(dept) {
  try {
    const raw = fs.readFileSync(statusPath(dept), "utf8");
    return JSON.parse(raw);
  } catch {
    return { dept, status: "idle" };
  }
}

function writeStatus(dept, patch) {
  ensureDir();
  const current = readStatus(dept);
  const next = { ...current, ...patch, dept, updatedAt: new Date().toISOString() };
  fs.writeFileSync(statusPath(dept), JSON.stringify(next, null, 2));
  return next;
}

function readAll(deptKeys) {
  ensureDir();
  const out = {};
  for (const dept of deptKeys) out[dept] = readStatus(dept);
  return out;
}

module.exports = { STATUS_DIR, ensureDir, statusPath, readStatus, writeStatus, readAll };
