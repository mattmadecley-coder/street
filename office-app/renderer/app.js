const messagesEl = document.getElementById("messages");
const departmentsEl = document.getElementById("departments");
const composerEl = document.getElementById("composer");
const inputEl = document.getElementById("input");
const sendEl = document.getElementById("send");
const clockInToggleEl = document.getElementById("clockInToggle");
const clockInLabelEl = document.getElementById("clockInLabel");
const clockInDetailEl = document.getElementById("clockInDetail");
const modalOverlayEl = document.getElementById("deptModal");
const modalTitleEl = document.getElementById("modalTitle");
const modalBodyEl = document.getElementById("modalBody");
const modalCloseEl = document.getElementById("modalClose");

let departments = [];
let lastStatus = {}; // dept key -> last status string we already showed a line for
let scheduler = { paused: false, intervalHours: 2, workStartHour: 9, workEndHour: 17, autoExcluded: ["qa"] };
let autoExcludedSet = new Set(scheduler.autoExcluded);
let lastRenderedStatuses = {};

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

function formatClock(date) {
  let h = date.getHours();
  const m = date.getMinutes();
  const period = h >= 12 ? "PM" : "AM";
  h = h % 12 === 0 ? 12 : h % 12;
  return `${h}:${String(m).padStart(2, "0")} ${period}`;
}

// What to show under a department's state for when it'll next work on its
// own -- null means "don't show a second line" (it's either mid-task, where
// the state label above already says enough, or there's nothing to predict).
function describeNextCheckIn(dept, s) {
  if (autoExcludedSet.has(dept.key)) return "On demand only";
  if (scheduler.paused) return "Paused";
  if (s.status === "sent" || s.status === "working") return null;
  if (!s.nextCheckInAt) return null;
  const due = new Date(s.nextCheckInAt);
  const now = new Date();
  if (due <= now) return "Due any moment";
  const sameDay = due.toDateString() === now.toDateString();
  return sameDay ? `Next check-in ${formatClock(due)}` : `Next check-in tomorrow ${formatClock(due)}`;
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// The headline is the whole point of the simplified view: one short,
// plain-English, emoji-led sentence each department writes about itself
// every run (see lib/claude-runner.js). We just display it as-is -- no
// truncation, no re-wording -- it's already supposed to be short.
function renderDepartments(statuses) {
  lastRenderedStatuses = statuses;
  departmentsEl.innerHTML = "";
  for (const dept of departments) {
    const s = statuses[dept.key] || { status: "idle" };
    const card = document.createElement("div");
    card.className = "dept-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `${dept.displayName} -- click for more detail`);
    const nextLine = describeNextCheckIn(dept, s);
    const headline = s.summary ? escapeHtml(s.summary) : null;
    card.innerHTML = `
      <div class="dept-dot ${s.status || "idle"}"></div>
      <div class="dept-info">
        <div class="dept-name">${dept.displayName}</div>
        ${
          headline
            ? `<div class="dept-headline">${headline}</div>`
            : `<div class="dept-state">${stateLabel(s.status)}</div>`
        }
        <div class="dept-meta">
          ${headline ? `<span class="dept-state-mini">${stateLabel(s.status)}</span>` : ""}
          ${nextLine ? `<span class="dept-next">${nextLine}</span>` : ""}
        </div>
      </div>
    `;
    if (s.task) card.title = s.task;
    card.addEventListener("click", () => openDeptDetails(dept));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openDeptDetails(dept);
      }
    });
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

// A very small, deliberately dumb markdown-to-HTML step for the
// department detail panel -- just headings and paragraphs, nothing
// fancier. The daily brief files are written to be plain English by
// design, so there's nothing complex to render here; this just keeps
// line breaks and "### " headings readable instead of one wall of text.
function renderMarkdownLite(markdown) {
  if (!markdown) return "";
  const lines = escapeHtml(markdown).split(/\r?\n/);
  let html = "";
  let paragraph = [];
  const flushParagraph = () => {
    if (paragraph.length) {
      html += `<p>${paragraph.join(" ")}</p>`;
      paragraph = [];
    }
  };
  for (const line of lines) {
    const heading = line.match(/^(#{1,4})\s+(.*)/);
    if (heading) {
      flushParagraph();
      const level = Math.min(heading[1].length + 2, 6);
      html += `<h${level}>${heading[2]}</h${level}>`;
    } else if (line.trim() === "") {
      flushParagraph();
    } else {
      paragraph.push(line);
    }
  }
  flushParagraph();
  return html;
}

function closeDeptDetails() {
  modalOverlayEl.classList.add("hidden");
}

// Click (or Enter/Space) on a department card -> the simple, plain-English
// recap for today, falling back to the technical log if nothing's been
// written in the new friendly format yet. This is the "click in for more
// detail" Matthew asked for.
async function openDeptDetails(dept) {
  modalTitleEl.textContent = dept.displayName;
  modalBodyEl.innerHTML = `<p class="modal-hint">Loading...</p>`;
  modalOverlayEl.classList.remove("hidden");

  const details = await window.streetHQ.getDeptDetails(dept.key);
  if (!details || !details.ok) {
    modalBodyEl.innerHTML = `<p class="modal-hint">Couldn't load more detail for this department right now.</p>`;
    return;
  }
  if (details.daily) {
    modalBodyEl.innerHTML = renderMarkdownLite(details.daily);
  } else if (details.logTail) {
    modalBodyEl.innerHTML = `
      <p class="modal-hint">No simple recap yet today -- here's the technical log instead:</p>
      <pre class="modal-log">${escapeHtml(details.logTail)}</pre>
    `;
  } else {
    modalBodyEl.innerHTML = `<p class="modal-hint">Nothing to show yet -- check back after the next check-in.</p>`;
  }
}

modalCloseEl.addEventListener("click", closeDeptDetails);
modalOverlayEl.addEventListener("click", (e) => {
  if (e.target === modalOverlayEl) closeDeptDetails();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modalOverlayEl.classList.contains("hidden")) closeDeptDetails();
});

async function init() {
  const data = await window.streetHQ.init();
  departments = data.departments;
  if (data.scheduler) scheduler = data.scheduler;
  autoExcludedSet = new Set(scheduler.autoExcluded || []);
  renderDepartments(data.statuses);
  renderClockIn();
  lastStatus = Object.fromEntries(
    departments.map((d) => [d.key, (data.statuses[d.key] || {}).status || "idle"])
  );

  for (const turn of data.history) {
    addBubble(turn.role, turn.text);
  }

  window.streetHQ.onStatusUpdate((statuses) => applyStatusUpdate(statuses, { announce: true }));
  // The GM talking to Matthew on its own, not just replying -- right now
  // that's only the once-a-day wrap-up digest.
  window.streetHQ.onGmMessage((text) => addBubble("gm", text));
}

clockInToggleEl.addEventListener("click", async () => {
  const result = await window.streetHQ.toggleScheduler(!scheduler.paused);
  scheduler.paused = result.paused;
  renderClockIn();
  renderDepartments(lastRenderedStatuses);
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

// Voice to text. Electron's Chromium ships the Web Speech API, so this is
// zero extra dependencies and no API key -- but it's a known rough edge
// that Electron builds sometimes can't reach the recognition service (no
// network, or the request is rejected) where real Chrome can. If that
// happens here we say so plainly and point at Windows' own built-in
// dictation (Win+H), which works in this box too and never depends on
// this app at all.
const micEl = document.getElementById("mic");
const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;
let voiceBaseText = "";

function setListening(isListening) {
  listening = isListening;
  micEl.classList.toggle("listening", isListening);
}

if (!SpeechRecognitionImpl) {
  micEl.classList.add("unsupported");
  micEl.title = "Voice to text isn't available in this build -- try Windows' own dictation instead (press Win+H while typing here).";
} else {
  recognition = new SpeechRecognitionImpl();
  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let transcript = "";
    for (let i = 0; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    inputEl.value = voiceBaseText ? `${voiceBaseText} ${transcript}` : transcript;
    inputEl.dispatchEvent(new Event("input"));
  };

  recognition.onerror = (event) => {
    setListening(false);
    if (event.error === "no-speech" || event.error === "aborted") return; // not worth a status line
    const hint = "Try Windows' own dictation instead -- press Win+H while typing.";
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      addStatusLine(
        `⚠ Mic access was blocked. Allow microphone access for Street HQ in Windows' privacy settings, then try again.`,
        "error"
      );
    } else {
      addStatusLine(`⚠ Voice input didn't work (${event.error}). ${hint}`, "error");
    }
  };

  recognition.onend = () => setListening(false);

  micEl.addEventListener("click", () => {
    if (listening) {
      recognition.stop();
      return;
    }
    voiceBaseText = inputEl.value.trim();
    try {
      recognition.start();
      setListening(true);
    } catch {
      // start() throws if it's already starting/running -- safe to ignore
    }
  });
}

init();
