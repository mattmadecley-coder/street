// Builds the simple, friendly "here's what everyone did today" message the
// GM sends into the chat on its own -- Matthew asked for this directly: he
// wants the GM proactively telling him what each department worked on and
// what's next, in plain words, not just the technical log files. Pure and
// fast (no extra `claude` call): it reuses the same one-line headline every
// department already writes to its own status-line.md each run.
const fs = require("fs");
const path = require("path");
const { listDepartments } = require("./departments");
const { readStatus } = require("./status-store");

function firstLine(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8").trim();
    return raw.split(/\r?\n/)[0] || null;
  } catch {
    return null;
  }
}

// Only counts a department's headline if it actually ran TODAY -- an old
// headline from a previous day would be misleading in a "today" digest.
function todaysHeadline(dept) {
  const status = readStatus(dept.key);
  const finished = status.finishedAt || status.startedAt;
  if (!finished) return null;
  if (new Date(finished).toDateString() !== new Date().toDateString()) return null;
  return firstLine(path.join(dept.hqDir, "status-line.md")) || status.summary || null;
}

// Returns the digest text, or null if nothing happened today worth sending
// (e.g. Matthew opened the app before anyone has clocked in yet).
function buildDigestText() {
  const lines = [];
  for (const dept of listDepartments()) {
    const headline = todaysHeadline(dept);
    if (!headline) continue;
    lines.push(`${dept.displayName}: ${headline}`);
  }
  if (!lines.length) return null;
  return `📋 Daily wrap-up -- here's what everyone's been up to today:\n\n${lines.join("\n")}`;
}

module.exports = { buildDigestText };
