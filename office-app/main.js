const path = require("path");
const fs = require("fs");
const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const { listDepartments } = require("./lib/departments");
const { STATUS_DIR, ensureDir, readAll } = require("./lib/status-store");
const { REPO_ROOT } = require("./lib/departments");
const { buildGmPrompt, runClaudeOnce } = require("./lib/claude-runner");

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

function broadcastStatus() {
  const deptKeys = listDepartments().map((d) => d.key);
  const statuses = readAll(deptKeys);
  if (mainWindow) mainWindow.webContents.send("dept:status-all", statuses);
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
  return { departments, statuses, history };
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
  loadHistory();
  watchStatusDir();
  createWindow();
});

app.on("window-all-closed", () => app.quit());
