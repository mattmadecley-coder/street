const path = require("path");
const fs = require("fs");
const { app, BrowserWindow, ipcMain, Menu, session } = require("electron");
const { listDepartments } = require("./lib/departments");
const { STATUS_DIR, ensureDir, readAll } = require("./lib/status-store");
const { REPO_ROOT } = require("./lib/departments");
const { buildGmPrompt, runClaudeOnce } = require("./lib/claude-runner");
const { fireDepartment } = require("./lib/fire.js");
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

ipcMain.handle("gm:send", async (_event, message) => {
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
});

app.on("window-all-closed", () => app.quit());
