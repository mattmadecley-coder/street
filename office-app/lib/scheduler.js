// The "clock in, then keep working all day" mechanism Matthew asked for.
// Runs inside the Electron main process -- it only exists, and only fires
// anyone, while the app itself is open. On a poll tick, any department
// that's gone more than CHECK_IN_INTERVAL_MS since its last run (or has
// never run this app session) and isn't already busy gets auto-fired for a
// plain check-in -- no specific task, just "look at your own goals.md and
// make progress, same as always." The first tick after the app opens during
// work hours is effectively everyone "clocking in" for the day.
const { listDepartments } = require("./departments");
const { readStatus } = require("./status-store");

const CHECK_IN_INTERVAL_MS = 2 * 60 * 60 * 1000; // how often each department checks in on itself
const POLL_MS = 5 * 60 * 1000; // how often we look for departments that are due
const STAGGER_MS = 20 * 1000; // space out firings so we don't launch a dozen claude processes at once
const WORK_START_HOUR = 9;
const WORK_END_HOUR = 17;

// QA is reactive by design -- other departments call it via the Task tool
// when they have something to review, so it's already "continuous" in the
// way that matters for QA. It never gets an autonomous check-in of its own.
const AUTO_EXCLUDE = new Set(["qa"]);

function withinWorkHours(date = new Date()) {
  const h = date.getHours();
  return h >= WORK_START_HOUR && h < WORK_END_HOUR;
}

function isDue(deptKey) {
  const status = readStatus(deptKey);
  if (status.status === "sent" || status.status === "working") return false; // already busy
  const last = status.finishedAt || status.startedAt;
  if (!last) return true; // never run this app session -- clock in
  return Date.now() - new Date(last).getTime() >= CHECK_IN_INTERVAL_MS;
}

// fireAutoCheckin(deptKey) -> void. isPaused() -> bool, checked fresh on
// every tick so a pause/resume from the UI takes effect immediately.
function startScheduler({ fireAutoCheckin, isPaused }) {
  function tick() {
    if (isPaused()) return;
    if (!withinWorkHours()) return;
    const depts = listDepartments().filter((d) => !AUTO_EXCLUDE.has(d.key));
    let delay = 0;
    for (const dept of depts) {
      if (isDue(dept.key)) {
        setTimeout(() => {
          if (!isPaused()) fireAutoCheckin(dept.key);
        }, delay);
        delay += STAGGER_MS;
      }
    }
  }
  tick(); // check right away -- this is the "clock in" moment if it's a new day
  const handle = setInterval(tick, POLL_MS);
  return { stop: () => clearInterval(handle) };
}

module.exports = {
  startScheduler,
  CHECK_IN_INTERVAL_MS,
  WORK_START_HOUR,
  WORK_END_HOUR,
};
