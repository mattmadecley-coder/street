// Shared department registry. Single source of truth is ../scripts/departments.json
// (same file the fire-department.ps1 terminal script uses) -- this just adds
// friendly display names and a couple of helpers for the app.
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

const DISPLAY_NAMES = {
  gm: "General Manager",
  analytics: "Analytics HQ",
  catalog: "Catalog HQ",
  finance: "Finance HQ",
  "growth-lifecycle": "Lifecycle HQ",
  "growth-seo": "SEO HQ",
  "growth-social": "Social HQ",
  infrastructure: "Infrastructure HQ",
  legal: "Legal HQ",
  partnerships: "Partnerships HQ",
  product: "Product HQ",
  qa: "QA HQ",
};

function titleize(key) {
  return (
    key
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ") + " HQ"
  );
}

function loadMap() {
  const raw = fs.readFileSync(
    path.join(REPO_ROOT, "scripts", "departments.json"),
    "utf8"
  );
  return JSON.parse(raw);
}

function listDepartments() {
  const map = loadMap();
  // The app's sidebar is about the specialist departments, not the GM itself.
  return Object.keys(map)
    .filter((key) => key !== "gm")
    .map((key) => ({
      key,
      displayName: DISPLAY_NAMES[key] || titleize(key),
      agentFile: map[key],
      hqDir: path.join(REPO_ROOT, "hq", key),
    }));
}

function getDepartment(key) {
  const map = loadMap();
  if (!map[key]) return null;
  return {
    key,
    displayName: DISPLAY_NAMES[key] || titleize(key),
    agentFile: map[key],
    hqDir: path.join(REPO_ROOT, "hq", key),
  };
}

module.exports = { REPO_ROOT, listDepartments, getDepartment, loadMap };
