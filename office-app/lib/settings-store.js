// One tiny persisted setting: is the "clock in and keep working" scheduler
// paused? Kept separate from status-store.js (which is per-department,
// per-run state) because this is a single app-wide on/off switch Matthew
// controls from the UI.
const fs = require("fs");
const path = require("path");

const SETTINGS_FILE = path.join(__dirname, "..", "settings.json");

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
  } catch {
    return { schedulerPaused: false };
  }
}

function writeSettings(patch) {
  const next = { ...readSettings(), ...patch };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2));
  return next;
}

module.exports = { readSettings, writeSettings };
