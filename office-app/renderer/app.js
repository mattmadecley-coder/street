const messagesEl = document.getElementById("messages");
const departmentsEl = document.getElementById("departments");
const composerEl = document.getElementById("composer");
const inputEl = document.getElementById("input");
const sendEl = document.getElementById("send");
const clockInToggleEl = document.getElementById("clockInToggle");
const clockInLabelEl = document.getElementById("clockInLabel");
const clockInDetailEl = document.getElementById("clockInDetail");

let departments = [];
let lastStatus = {}; // dept key -> last status string we already showed a line for
let scheduler = { paused: false, intervalHours: 2, workStartHour: 9, workEndHour: 17 };

function addBubble(role, text) {
  const div = document.createElement("div");
  div.className = `bubble ${role === "user" ? "user" : "gm"}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function addStatusLine(text, kind) {
  const div = document.createElement("div");
  div.className = `status-line${kind ? " " + kind : ""}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function stateLabel(status) {
  switch (status) {
    case "sent": return "Sent";
    case "working": return "Working";
    case "done": return "Done";
    case "error": return "Needs attention";
    default: return "Idle";
  }
}

function renderDepartments(statuses) {
  departmentsEl.innerHTML = "";
  for (const dept of departments) {
    const s = statuses[dept.key] || { status: "idle" };
    const card = document.createElement("div");
    card.className = "dept-card";
    card.innerHTML = `
      <div class="dept-dot ${s.status || "idle"}"></div>
      <div class="dept-info">
        <div class="dept-name">${dept.displayName}</div>
        <div class="dept-state">${stateLabel(s.status)}</div>
      </div>
    `;
    if (s.task) card.title = s.task;
    departmentsEl.appendChild(card);
  }
}

function applyStatusUpdate(statuses, { announce }) {
  renderDepartments(statuses);
  if (!announce) {
    lastStatus = Object.fromEntries(
      departments.map((d) => [d.key, (statuses[d.key] || {}).status || "idle"])
    );
    return;
  }
  for (const dept of departments) {
    const s = statuses[dept.key] || { status: "idle" };
    const prev = lastStatus[dept.key] || "idle";
    if (s.status !== prev) {
      const isAuto = s.trigger === "auto";
      if (s.status === "sent") {
        addStatusLine(isAuto ? `→ ${dept.displayName} clocking in` : `→ Sent to ${dept.displayName}`);
      } else if (s.status === "working" && prev !== "sent") {
        addStatusLine(isAuto ? `⋯ ${dept.displayName} checking in on its own work` : `⋯ ${dept.displayName} is working`);
      } else if (s.status === "done") {
        addStatusLine(`✓ ${dept.displayName} replied: ${s.summary || "done."}`, "done");
      } else if (s.status === "error") {
        addStatusLine(`⚠ ${dept.displayName} hit a snag: ${s.summary || "unknown error"}`, "error");
      }
      lastStatus[dept.key] = s.status;
    }
  }
}

function renderClockIn() {
  clockInToggleEl.classList.toggle("on", !scheduler.paused);
  clockInToggleEl.setAttribute("aria-checked", String(!scheduler.paused));
  clockInLabelEl.textContent = scheduler.paused ? "Clocked out" : "Clocked in";
  clockInDetailEl.textContent = scheduler.paused
    ? "Departments won't start work on their own until you clock them back in."
    : `Checks in every ${scheduler.intervalHours}h, ${formatHour(scheduler.workStartHour)}–${formatHour(scheduler.workEndHour)}, while this app is open.`;
}

function formatHour(h) {
  const period = h >= 12 ? "pm" : "am";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}${period}`;
}

async function init() {
  const data = await window.streetHQ.init();
  departments = data.departments;
  if (data.scheduler) scheduler = data.scheduler;
  renderDepartments(data.statuses);
  renderClockIn();
  lastStatus = Object.fromEntries(
    departments.map((d) => [d.key, (data.statuses[d.key] || {}).status || "idle"])
  );

  for (const turn of data.history) {
    addBubble(turn.role, turn.text);
  }

  window.streetHQ.onStatusUpdate((statuses) => applyStatusUpdate(statuses, { announce: true }));
}

clockInToggleEl.addEventListener("click", async () => {
  const result = await window.streetHQ.toggleScheduler(!scheduler.paused);
  scheduler.paused = result.paused;
  renderClockIn();
});

composerEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;

  inputEl.value = "";
  inputEl.style.height = "auto";
  addBubble("user", text);

  sendEl.disabled = true;
  inputEl.disabled = true;
  const thinking = document.createElement("div");
  thinking.className = "thinking";
  thinking.textContent = "GM is thinking...";
  messagesEl.appendChild(thinking);
  scrollToBottom();

  const result = await window.streetHQ.sendToGM(text);

  thinking.remove();
  if (result.ok) {
    addBubble("gm", result.text);
  } else {
    addStatusLine(`⚠ Couldn't reach the GM: ${result.error}`, "error");
  }

  sendEl.disabled = false;
  inputEl.disabled = false;
  inputEl.focus();
});

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    composerEl.requestSubmit();
  }
});

inputEl.addEventListener("input", () => {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + "px";
});

init();
