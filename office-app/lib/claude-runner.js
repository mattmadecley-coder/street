// Shared "talk to local Claude Code" logic -- used both by the GM chat turn
// (main.js) and by a fired department's session (dept-runner.js). Always
// shells out to the SAME claude binary Matthew signs into interactively, so
// everything in this app runs on his existing Claude subscription. No API
// key, no per-token billing, ever.
const fs = require("fs");
const path = require("path");
const { spawn, execFileSync } = require("child_process");

// Matthew's own local session already found and fixed the Windows launch
// bug for this exact problem (npm's "claude" shim isn't a real Win32 exe).
// Resolve straight to the real claude.exe the shim points to, same as the
// fixed fire-department.ps1 does, so we never hit that bug again here.
function resolveClaudeExe() {
  if (process.env.APPDATA) {
    const candidate = path.join(
      process.env.APPDATA,
      "npm",
      "node_modules",
      "@anthropic-ai",
      "claude-code",
      "bin",
      "claude.exe"
    );
    if (fs.existsSync(candidate)) return { exe: candidate, useShell: false };
  }
  try {
    const where = execFileSync("where", ["claude.exe"], { encoding: "utf8" });
    const first = where.split(/\r?\n/).find((l) => l.trim().length > 0);
    if (first) return { exe: first.trim(), useShell: false };
  } catch {
    // fall through
  }
  // Last resort: let a real shell resolve the npm shim (claude.cmd). This is
  // slower to spawn but works even if we couldn't find claude.exe directly.
  return { exe: "claude", useShell: true };
}

const STYLE_PREAMBLE = `You are the General Manager (GM) of Street HQ, talking to Matthew inside his desktop app. If you haven't already this conversation, read hq/_shared/company.md and .claude/agents/gm.md (its "Chat mode" and "Running locally" sections) -- those are your real job, your Tier 1/2/3 boundaries, and the file-based reporting rules. Nothing below changes any of that -- it's just how to talk and which tool to reach for.

How to talk: short, plain, direct. Say the real thing in the fewest words. No corporate hedging, no "I'd be happy to", no filler, no bullet-point walls for a one-line answer. If something's done, say "done" and what happened. If something's broken, say what's broken and what you're doing about it. Matthew runs this business -- talk to him like a sharp operator giving him the straight answer, not a chatbot.

How to route work:
- Quick facts and live numbers (visitor counts, site status, revenue, whatever): don't just check hq/ files and stop if they're empty or stale -- that's cached state from the last scheduled run, not live data. Go get the real answer yourself, right now, in this same reply: read the relevant department's charter.md for its documented Tier 1 read-only way to look it up (most have one -- a database query via lib/supabase-rest.ts style PostgREST calls, an API route, an admin page), source .env.ops.local / .env.local yourself for whatever credentials that needs, run it (curl, a quick script, whatever's fastest), and answer with the real number. This is read-only and Tier 1 -- don't ask Matthew's permission first and don't punt to fire_department for something you can just go look up yourself in a few seconds. Only report "no data" if you actually tried to fetch it live and it genuinely isn't available.
- If Matthew wants a department to actually DO something that takes real time or changes something (fix, build, ship, investigate), log it to that department's hq/<dept>/questions.md under "## Assigned by Matthew" first, then call the fire_department tool with that department's key and the task. That tool runs the department in the background on this machine and it reports back into its own log.md. It is a different thing from the old fire-department.ps1 terminal script -- use the tool.
- Only ask Matthew before acting when it's genuinely Tier 2 (needs a GM/QA judgment call) or Tier 3 (money, deploys, schema changes, anything irreversible). Never ask permission for a Tier 1 read-only lookup -- just do it and answer.
- Department keys: gm, analytics, catalog, finance, growth-lifecycle, growth-seo, growth-social, infrastructure, legal, partnerships, product, qa.

Reply with your actual answer to Matthew's message below. Keep it short.`;

function buildGmPrompt(history, message) {
  const transcript = history
    .map((turn) => `${turn.role === "user" ? "Matthew" : "GM"}: ${turn.text}`)
    .join("\n\n");
  const historyBlock = transcript
    ? `Conversation so far:\n${transcript}\n\n`
    : "";
  return `${STYLE_PREAMBLE}\n\n${historyBlock}Matthew just said: ${message}`;
}

function buildDepartmentPrompt(dept, agentFile, task) {
  return `You are being fired up directly by the GM, through the Street HQ desktop app, to work on something right now on Matthew's own machine with full local access.

Before doing anything: read hq/_shared/company.md, your own agent definition at .claude/agents/${agentFile}, and your own hq/${dept}/charter.md, goals.md, and log.md.

Task from the GM:
"${task}"

Treat this as a Tier 1 "Assigned by GM" item unless it's clearly Tier 2 (needs GM/QA routing) or Tier 3 (needs Matthew's explicit approval -- deploys, schema changes, spending, the signup popup toggle, .env.ops.local structure changes). If it's Tier 2 or 3, don't do the risky part: write it to your hq/${dept}/questions.md under "## Assigned by GM" instead, explaining what you'd do and why it needs sign-off, and stop there.

Rules that don't change just because you have full local access now:
- Respect your own Tier 1/2/3 boundaries from your charter.
- Never write a secret, API key, or credential value into any hq/ file -- reference the env var name instead.
- When you're done (or you've written the question for Matthew), append exactly one line to hq/${dept}/log.md summarizing what you did or what you're waiting on. That line is what gets shown back to Matthew in the app, so make it clear and specific.
- Don't touch other departments' files.

Go.`;
}

// Runs one claude -p turn to completion and resolves with the reply text.
// Used for the GM's own chat replies, where we want the answer in memory.
function runClaudeOnce({ cwd, prompt, mcpConfigPath, timeoutMs = 180000 }) {
  return new Promise((resolve) => {
    const { exe, useShell } = resolveClaudeExe();
    const args = ["-p", prompt, "--output-format", "json", "--dangerously-skip-permissions"];
    if (mcpConfigPath) args.push("--mcp-config", mcpConfigPath);

    const child = spawn(exe, args, { cwd, shell: useShell, windowsHide: true });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: `Could not launch claude: ${err.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout.trim()) {
        resolve({ ok: false, error: stderr.trim() || `claude exited with code ${code}` });
        return;
      }
      resolve({ ok: true, text: extractReplyText(stdout), raw: stdout, exitCode: code });
    });
  });
}

// claude --output-format json prints one JSON object at the end. Be lenient
// about its exact shape -- fall back to raw stdout so the app never shows a
// blank reply just because a field name differs from what we expected.
function extractReplyText(stdout) {
  const trimmed = stdout.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed.result === "string") return parsed.result;
    if (typeof parsed.text === "string") return parsed.text;
  } catch {
    // not JSON (or multiple JSON lines) -- fall through to raw text below
  }
  // Last line of stdout is usually the actual answer if JSON parsing failed.
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  return lines.length ? lines[lines.length - 1] : "(no reply)";
}

module.exports = {
  resolveClaudeExe,
  buildGmPrompt,
  buildDepartmentPrompt,
  runClaudeOnce,
};
