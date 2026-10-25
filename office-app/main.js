const path = require("path");
const fs = require("fs");
const { app, BrowserWindow, ipcMain, Menu, session } = require("electron");
const { listDepartments, getDepartment } = require("./lib/departments");
const { STATUS_DIR, ensureDir, readAll } = require("./lib/status-store");
const { REPO_ROOT } = require("./lib/departments");
const { pullMainCheckout } = require("./lib/worktrees");
const { buildGmPrompt, runClaudeOnce } = require("./lib/claude-runner");
const { fireDepartment } = require("./lib/fire.js");
const { buildDigestText } = require("./lib/digest");
const {
  startScheduler,
  nextCheckInAt,
  CHECK_IN_INTERVAL_MS,
  WORK_START_HOUR,
  WORK_END_HOUR,
  AUTO_EXCLUDE,
} = require("./lib/scheduler");
const { readSettings, writeSettings } = require("./lib/settings-store");

// How often we refresh "Next check-in ..." in the UI even when nothing has
// actually changed -- a status file write triggers an immediate broadcast
// (see watchStatusDir below), this just keeps the predicted time from going
// stale while everyone's idle.
const SCHEDULE_REFRESH_MS = 60 * 1000;

const HISTORY_FILE = path.join(__dirname, "chat-history.json");
const MAX_HISTORY_TURNS = 30;

let mainWindow = null;
let history = [];

function loadHistory() {
  try {
    history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
  } catch {
    history = [];
  }
}

function saveHistory() {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch {
    // not fatal -- chat just won't survive a restart this one time
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 760,
    minHeight: 560,
    title: "Street HQ",
    backgroundColor: "#FAFAFA",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  Menu.setApplicationMenu(null);
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  if (process.env.STREET_HQ_DEBUG) mainWindow.webContents.openDevTools();
}

function withSchedule(statuses) {
  const out = {};
  for (const [key, status] of Object.entries(statuses)) {
    out[key] = { ...status, nextCheckInAt: nextCheckInAt(key) };
  }
  return out;
}

function broadcastStatus() {
  const deptKeys = listDepartments().map((d) => d.key);
  const statuses = readAll(deptKeys);
  if (mainWindow) mainWindow.webContents.send("dept:status-all", withSchedule(statuses));
}

function watchStatusDir() {
  ensureDir();
  let pending = null;
  fs.watch(STATUS_DIR, () => {
    clearTimeout(pending);
    pending = setTimeout(broadcastStatus, 150);
  });
}

// Matthew asked for the GM to proactively tell him what each department
// did and what's next -- not just make him ask. Sends one plain-English
// wrap-up a day, once work hours are basically over, built straight from
// the same short headlines the departments already write for the sidebar
// (see lib/digest.js). Guarded by settings so it only ever goes out once
// per calendar day no matter how many times this fires or the app
// restarts that day.
function maybeSendDailyDigest() {
  const now = new Date();
  if (now.getHours() < WORK_END_HOUR) return;
  const today = now.toISOString().slice(0, 10);
  const settings = readSettings();
  if (settings.lastDigestDate === today) return;
  const text = buildDigestText();
  if (!text) return; // nobody's done anything today yet -- nothing to send
  writeSettings({ lastDigestDate: today });
  history.push({ role: "assistant", text });
  if (history.length > MAX_HISTORY_TURNS * 2) {
    history = history.slice(-MAX_HISTORY_TURNS * 2);
  }
  saveHistory();
  if (mainWindow) mainWindow.webContents.send("gm:message", text);
}

ipcMain.handle("app:init", async () => {
  const departments = listDepartments().map((d) => ({
    key: d.key,
    displayName: d.displayName,
  }));
  const statuses = readAll(departments.map((d) => d.key));
  const settings = readSettings();
  return {
    departments,
    statuses: withSchedule(statuses),
    history,
    scheduler: {
      paused: !!settings.schedulerPaused,
      intervalHours: CHECK_IN_INTERVAL_MS / (60 * 60 * 1000),
      workStartHour: WORK_START_HOUR,
      workEndHour: WORK_END_HOUR,
      autoExcluded: AUTO_EXCLUDE,
    },
  };
});

ipcMain.handle("scheduler:toggle", async (_event, paused) => {
  const settings = writeSettings({ schedulerPaused: !!paused });
  return { paused: !!settings.schedulerPaused };
});

// Backs the "click a department for more detail" view: the sidebar only
// ever shows the one-line headline, this is where the fuller, still
// plain-English picture lives -- today's entries from hq/<dept>/daily/,
// falling back to the technical log.md tail if a department hasn't
// written a daily brief yet (e.g. right after this feature shipped).
ipcMain.handle("dept:details", async (_event, deptKey) => {
  const dept = getDepartment(deptKey);
  if (!dept) return { ok: false, error: "Unknown department." };

  const today = new Date().toISOString().slice(0, 10);
  const dailyPath = path.join(dept.hqDir, "daily", `${today}.md`);
  let daily = null;
  try {
    daily = fs.readFileSync(dailyPath, "utf8");
  } catch {
    // no daily brief yet today -- fall through to the technical fallback below
  }

  let logTail = null;
  if (!daily) {
    try {
      const raw = fs.readFileSync(path.join(dept.hqDir, "log.md"), "utf8");
      const lines = raw.split(/\r?\n/).filter((l) => l.trim().startsWith("-"));
      logTail = lines.slice(-6).join("\n");
    } catch {
      // nothing logged yet either
    }
  }

  const status = readAll([dept.key])[dept.key] || {};
  return {
    ok: true,
    displayName: dept.displayName,
    headline: status.summary || null,
    daily,
    logTail,
  };
});

ipcMain.handle("gm:send", async (_event, message) => {
  // Departments push their own hq/ updates back onto `work` from their own
  // worktrees -- pick that up now so the GM answers from fresh state
  // instead of whatever REPO_ROOT happened to have last.
  pullMainCheckout();
  history.push({ role: "user", text: message });
  const prompt = buildGmPrompt(history.slice(0, -1), message);
  const result = await runClaudeOnce({ cwd: REPO_ROOT, prompt });

  if (!result.ok) {
    history.pop(); // don't poison future turns with a failed exchange
    saveHistory();
    return { ok: false, error: result.error };
  }

  history.push({ role: "assistant", text: result.text });
  if (history.length > MAX_HISTORY_TURNS * 2) {
    history = history.slice(-MAX_HISTORY_TURNS * 2);
  }
  saveHistory();
  return { ok: true, text: result.text };
});

app.whenReady().then(() => {
  // The only permission this app ever needs is the microphone, for the
  // chat composer's voice-to-text button. Deny everything else by default.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });
  if (session.defaultSession.setPermissionCheckHandler) {
    session.defaultSession.setPermissionCheckHandler((_webContents, permission) => permission === "media");
  }

  loadHistory();
  watchStatusDir();
  createWindow();
  startScheduler({
    fireAutoCheckin: (deptKey) => fireDepartment(deptKey, { trigger: "auto" }),
    isPaused: () => !!readSettings().schedulerPaused,
  });
  setInterval(broadcastStatus, SCHEDULE_REFRESH_MS);
  // Keep the main checkout's hq/ files from going stale between chat
  // turns too -- same best-effort fast-forward pull, just on a timer.
  setInterval(pullMainCheckout, SCHEDULE_REFRESH_MS);
  // Catch Matthew up with today's digest right away if he opens the app
  // after everyone's basically done for the day, then keep checking once
  // a minute so it goes out the moment work hours end if he's already here.
  maybeSendDailyDigest();
  setInterval(maybeSendDailyDigest, SCHEDULE_REFRESH_MS);
});

app.on("window-all-closed", () => app.quit());
