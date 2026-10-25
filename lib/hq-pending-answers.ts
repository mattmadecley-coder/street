// Write side of the hq_questions two-way sync: when Matthew answers a
// question from /admin/hq, this appends the answer to
// hq/_shared/pending-answers.json via a direct commit to the `work` branch
// (the GitHub Contents API, same approach lib/hq-dashboard-source.ts uses
// to read -- just a PUT instead of a GET).
//
// This does NOT edit the department's own questions.md directly: that file's
// format varies department to department (freeform markdown, not a fixed
// schema -- see hq/_shared/dashboard-schema.md's notes on why that
// extraction is a reading-comprehension job, not a regex one), so a
// deterministic Next.js write path has no safe way to locate and rewrite
// the right lines there. Instead it stages the answer in one small,
// fixed-shape JSON file; each department's own agent run (which already
// reads and rewrites its own questions.md with real judgment every time it
// runs) is what reconciles a staged answer into that file and clears the
// staged entry. See hq/_shared/pending-answers-schema.md for the contract
// and what still needs wiring up on that consuming side.
//
// Needs its own write-scoped GitHub token (HQ_DASHBOARD_GITHUB_WRITE_TOKEN)
// -- deliberately separate from both the read-only HQ_DASHBOARD_GITHUB_TOKEN
// this feature reads with and the ops-only push-capable GH_TOKEN. Until
// Infrastructure provisions it, submitting an answer fails with a clear
// error instead of silently doing nothing.
import { hqQuestionId } from "@/lib/hq-question-id";

const PENDING_ANSWERS_PATH = "hq/_shared/pending-answers.json";

export type PendingHqAnswer = {
  department: string;
  question_id: string;
  question: string;
  answer: string;
  answered_by: string;
  answered_at: string;
};

type WriteConfig = { repo: string; branch: string; token: string };

function getWriteConfig(): WriteConfig | null {
  const token = process.env.HQ_DASHBOARD_GITHUB_WRITE_TOKEN;
  if (!token) return null;
  const repo = process.env.HQ_DASHBOARD_GITHUB_REPO ?? "mattmadecley-coder/street";
  const branch = process.env.HQ_DASHBOARD_GITHUB_BRANCH ?? "work";
  return { repo, branch, token };
}

export function hasHqAnswerWriteSource(): boolean {
  return Boolean(getWriteConfig());
}

export class HqAnswerWriteError extends Error {}

type ContentsGetResult = { sha: string | null; answers: PendingHqAnswer[] };

async function getCurrentPendingAnswers(config: WriteConfig): Promise<ContentsGetResult> {
  const url = `https://api.github.com/repos/${config.repo}/contents/${encodeURIComponent(PENDING_ANSWERS_PATH)}?ref=${encodeURIComponent(config.branch)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });
  if (response.status === 404) return { sha: null, answers: [] };
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new HqAnswerWriteError(`GitHub returned ${response.status} reading ${PENDING_ANSWERS_PATH}${body ? ` -- ${body.slice(0, 300)}` : ""}`);
  }
  const body = (await response.json()) as { sha?: string; content?: string };
  const decoded = body.content ? Buffer.from(body.content, "base64").toString("utf8") : "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new HqAnswerWriteError(`${PENDING_ANSWERS_PATH} on ${config.branch} is not valid JSON`);
  }
  const answers = Array.isArray((parsed as { answers?: unknown })?.answers) ? ((parsed as { answers: unknown[] }).answers as PendingHqAnswer[]) : [];
  return { sha: body.sha ?? null, answers };
}

/**
 * Stages an answer for a department's run to pick up and reconcile into its
 * own questions.md. Replaces any existing pending entry for the same
 * question (a resubmission overwrites, it doesn't duplicate).
 */
export async function submitPendingHqAnswer(input: { department: string; question: string; answer: string; answeredBy: string }): Promise<void> {
  const config = getWriteConfig();
  if (!config) throw new HqAnswerWriteError("HQ_DASHBOARD_GITHUB_WRITE_TOKEN is not set yet -- see hq/_shared/pending-answers-schema.md.");

  const questionId = hqQuestionId(input.department, input.question);
  const { sha, answers } = await getCurrentPendingAnswers(config);

  const next: PendingHqAnswer[] = [
    ...answers.filter((entry) => entry.question_id !== questionId),
    {
      department: input.department,
      question_id: questionId,
      question: input.question,
      answer: input.answer,
      answered_by: input.answeredBy,
      answered_at: new Date().toISOString(),
    },
  ];

  const content = Buffer.from(`${JSON.stringify({ answers: next }, null, 2)}\n`, "utf8").toString("base64");
  const url = `https://api.github.com/repos/${config.repo}/contents/${encodeURIComponent(PENDING_ANSWERS_PATH)}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: `hq: stage answer for ${input.department} via /admin/hq`,
      content,
      branch: config.branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new HqAnswerWriteError(`GitHub returned ${response.status} writing ${PENDING_ANSWERS_PATH}${body ? ` -- ${body.slice(0, 300)}` : ""}`);
  }
}
