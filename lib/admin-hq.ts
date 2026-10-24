// Data access for the /admin/hq office page. Reads `hq/_shared/dashboard.json`
// straight off GitHub (via lib/hq-dashboard-source.ts) -- the GM commits that
// file to the `work` branch every run, the same reliable git push it already
// does for every other `hq/` file. See hq/_shared/dashboard-schema.md for the
// JSON contract.
//
// v1 is read-only: there is no write path here on purpose (see
// hq/product/charter.md "First job").
//
// Previously this read the hq_* Supabase tables, kept in sync by a nightly
// DELETE+INSERT sync the GM ran via the Supabase MCP tool. That sync kept
// hanging on an unanswered destructive-operation confirmation, so it's been
// replaced with this git-native source -- see hq/product/questions.md
// ("Assigned by Matthew", 2026-10-24) for the history. The hq_* tables and
// their migration (supabase/migrations/20261023_hq_tables.sql) are left in
// place, unused, until Matthew says to drop them (that's a schema change).
import { cache } from "react";
import { fetchHqDashboardRaw, hasHqDashboardSource } from "@/lib/hq-dashboard-source";

export type HqDepartment = {
  id: string;
  display_name: string;
  last_run_at: string | null;
  last_status: string | null;
  updated_at: string;
};

export type HqLog = {
  id: string;
  department: string;
  ran_at: string;
  message: string;
  created_at: string;
};

export type HqQuestionStatus = "open" | "answered";

export type HqQuestion = {
  id: string;
  department: string;
  question: string;
  recommendation: string | null;
  status: HqQuestionStatus;
  answer: string | null;
  created_at: string;
  answered_at: string | null;
};

export type HqGoalStatus = "open" | "done" | "blocked";

export type HqGoal = {
  id: string;
  department: string;
  goal: string;
  status: HqGoalStatus;
  note: string | null;
  updated_at: string;
};

export type HqBrief = {
  id: string;
  brief_date: string;
  content: string;
  created_at: string;
};

/**
 * Tabs shared by every /admin/hq/* page. `active` must match one `href`
 * exactly (the shared Tabs component does an exact match, not a prefix
 * match). Typed as a plain mutable array -- the Tabs component's prop
 * type is `Array<{ href; label; badge? }>`, which a `readonly` tuple
 * (what `as const` would give here) is not assignable to.
 */
export const OFFICE_TABS: Array<{ href: string; label: string }> = [
  { href: "/admin/hq", label: "Today" },
  { href: "/admin/hq/inbox", label: "Inbox" },
  { href: "/admin/hq/departments", label: "Departments" },
  { href: "/admin/hq/gm", label: "GM" },
];

/** Keeps departments in the order the business actually runs them, not whatever order the file lists them in. */
const DEPARTMENT_ORDER = [
  "gm", "product", "infrastructure", "catalog", "analytics", "partnerships",
  "growth-seo", "growth-social", "growth-lifecycle", "legal", "finance", "qa",
];

function departmentRank(id: string): number {
  const index = DEPARTMENT_ORDER.indexOf(id);
  return index === -1 ? DEPARTMENT_ORDER.length : index;
}

function byDepartment<T extends { department: string }>(a: T, b: T): number {
  return departmentRank(a.department) - departmentRank(b.department);
}

function byId<T extends { id: string }>(a: T, b: T): number {
  return departmentRank(a.id) - departmentRank(b.id);
}

/** Badge tone for a department's free-text last_status (written by that department's own run). */
export function statusTone(status: string | null): "success" | "warn" | "danger" | "info" {
  if (!status) return "info";
  if (/error|fail|block/i.test(status)) return "danger";
  if (/warn|partial|blocked/i.test(status)) return "warn";
  if (/ok|done|clean|healthy|success/i.test(status)) return "success";
  return "info";
}

export function goalTone(status: HqGoalStatus): "success" | "warn" | "danger" | "info" {
  if (status === "done") return "success";
  if (status === "blocked") return "danger";
  return "info";
}

export function questionTone(status: HqQuestionStatus): "success" | "warn" {
  return status === "answered" ? "success" : "warn";
}

// ---------------------------------------------------------------------------
// hq/_shared/dashboard.json parsing
// ---------------------------------------------------------------------------

type RawDepartment = { id?: unknown; display_name?: unknown; last_run_at?: unknown; last_status?: unknown };
type RawLog = { ran_at?: unknown; message?: unknown };
type RawQuestion = { question?: unknown; recommendation?: unknown; status?: unknown; answer?: unknown; created_at?: unknown; answered_at?: unknown };
type RawGoal = { goal?: unknown; status?: unknown; note?: unknown; updated_at?: unknown };
type RawBrief = { brief_date?: unknown; content?: unknown };
type RawDashboard = {
  generated_at?: unknown;
  departments?: unknown;
  logs?: unknown;
  questions?: unknown;
  goals?: unknown;
  briefs?: unknown;
};

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
function strOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** The parsed, typed picture of hq/_shared/dashboard.json, grouped by department. */
type ParsedDashboard = {
  generatedAt: string | null;
  departments: HqDepartment[];
  logsByDept: Map<string, HqLog[]>;
  questionsByDept: Map<string, HqQuestion[]>;
  goalsByDept: Map<string, HqGoal[]>;
  briefs: HqBrief[];
};

function parseDashboard(raw: RawDashboard): ParsedDashboard {
  const departments: HqDepartment[] = asArray(raw.departments)
    .map((entry) => entry as RawDepartment)
    .filter((entry) => typeof entry.id === "string")
    .map((entry) => ({
      id: entry.id as string,
      display_name: str(entry.display_name, entry.id as string),
      last_run_at: strOrNull(entry.last_run_at),
      last_status: strOrNull(entry.last_status),
      updated_at: str(raw.generated_at),
    }))
    .sort(byId);

  const logsByDept = new Map<string, HqLog[]>();
  const logsRaw = asRecord(raw.logs);
  for (const department of Object.keys(logsRaw)) {
    const entries = asArray(logsRaw[department])
      .map((entry) => entry as RawLog)
      .map((entry, index) => ({
        id: `${department}:log:${index}`,
        department,
        ran_at: str(entry.ran_at),
        message: str(entry.message),
        created_at: str(entry.ran_at),
      }));
    logsByDept.set(department, entries);
  }

  const questionsByDept = new Map<string, HqQuestion[]>();
  const questionsRaw = asRecord(raw.questions);
  for (const department of Object.keys(questionsRaw)) {
    const entries = asArray(questionsRaw[department])
      .map((entry) => entry as RawQuestion)
      .map((entry, index) => ({
        id: `${department}:question:${index}`,
        department,
        question: str(entry.question),
        recommendation: strOrNull(entry.recommendation),
        status: (entry.status === "answered" ? "answered" : "open") as HqQuestionStatus,
        answer: strOrNull(entry.answer),
        created_at: str(entry.created_at),
        answered_at: strOrNull(entry.answered_at),
      }));
    questionsByDept.set(department, entries);
  }

  const goalsByDept = new Map<string, HqGoal[]>();
  const goalsRaw = asRecord(raw.goals);
  for (const department of Object.keys(goalsRaw)) {
    const entries = asArray(goalsRaw[department])
      .map((entry) => entry as RawGoal)
      .map((entry, index) => ({
        id: `${department}:goal:${index}`,
        department,
        goal: str(entry.goal),
        status: (entry.status === "done" || entry.status === "blocked" ? entry.status : "open") as HqGoalStatus,
        note: strOrNull(entry.note),
        updated_at: str(entry.updated_at),
      }));
    goalsByDept.set(department, entries);
  }

  const briefs: HqBrief[] = asArray(raw.briefs)
    .map((entry) => entry as RawBrief)
    .map((entry, index) => ({
      id: `brief:${str(entry.brief_date, String(index))}`,
      brief_date: str(entry.brief_date),
      content: str(entry.content),
      created_at: str(entry.brief_date),
    }))
    // Most-recent-first, regardless of what order the file lists them in.
    .sort((a, b) => (a.brief_date < b.brief_date ? 1 : a.brief_date > b.brief_date ? -1 : 0));

  return { generatedAt: strOrNull(raw.generated_at), departments, logsByDept, questionsByDept, goalsByDept, briefs };
}

/**
 * Loads and parses hq/_shared/dashboard.json. `React.cache` scopes this to
 * one request/render pass (not a module-level global) -- a page like Today,
 * which calls into this indirectly more than once, only hits the GitHub API
 * once; the next request re-fetches, respecting the 60s revalidate window
 * in lib/hq-dashboard-source.ts instead of caching forever for the life of
 * the server process.
 */
const loadParsedDashboard = cache(async (): Promise<ParsedDashboard | null> => {
  if (!hasHqDashboardSource()) return null;
  const raw = await fetchHqDashboardRaw();
  return raw ? parseDashboard(raw as RawDashboard) : null;
});

export type HqSnapshot = {
  available: boolean;
  departments: HqDepartment[];
  openQuestions: HqQuestion[];
  openGoals: HqGoal[];
  latestBrief: HqBrief | null;
};

const EMPTY_SNAPSHOT: HqSnapshot = { available: false, departments: [], openQuestions: [], openGoals: [], latestBrief: null };

/** Everything the Today page needs, in one shot. */
export async function loadHqSnapshot(): Promise<HqSnapshot> {
  const parsed = await loadParsedDashboard();
  if (!parsed) return EMPTY_SNAPSHOT;

  const openQuestions = [...parsed.questionsByDept.values()].flat().filter((q) => q.status === "open").sort(byDepartment);
  const openGoals = [...parsed.goalsByDept.values()].flat().filter((g) => g.status !== "done").sort(byDepartment);

  return {
    available: true,
    departments: parsed.departments,
    openQuestions,
    openGoals,
    latestBrief: parsed.briefs[0] ?? null,
  };
}

export async function loadHqDepartments(): Promise<{ available: boolean; departments: HqDepartment[] }> {
  const parsed = await loadParsedDashboard();
  if (!parsed) return { available: false, departments: [] };
  return { available: true, departments: parsed.departments };
}

export async function loadHqQuestions(status: HqQuestionStatus | "" = "open"): Promise<{ available: boolean; questions: HqQuestion[] }> {
  const parsed = await loadParsedDashboard();
  if (!parsed) return { available: false, questions: [] };
  const all = [...parsed.questionsByDept.values()].flat();
  const filtered = status ? all.filter((q) => q.status === status) : all;
  return { available: true, questions: filtered.sort(byDepartment) };
}

export type HqDepartmentDetail = {
  department: HqDepartment | null;
  logs: HqLog[];
  questions: HqQuestion[];
  goals: HqGoal[];
};

const EMPTY_DETAIL: HqDepartmentDetail = { department: null, logs: [], questions: [], goals: [] };

export async function loadHqDepartment(id: string): Promise<{ available: boolean; detail: HqDepartmentDetail }> {
  const parsed = await loadParsedDashboard();
  if (!parsed) return { available: false, detail: EMPTY_DETAIL };

  const department = parsed.departments.find((d) => d.id === id) ?? null;
  const logs = [...(parsed.logsByDept.get(id) ?? [])].sort((a, b) => (a.ran_at < b.ran_at ? 1 : a.ran_at > b.ran_at ? -1 : 0)).slice(0, 30);
  const questions = [...(parsed.questionsByDept.get(id) ?? [])].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  const goals = [...(parsed.goalsByDept.get(id) ?? [])].sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0));

  return { available: true, detail: { department, logs, questions, goals } };
}

export async function loadHqBriefs(limit = 30): Promise<{ available: boolean; briefs: HqBrief[] }> {
  const parsed = await loadParsedDashboard();
  if (!parsed) return { available: false, briefs: [] };
  return { available: true, briefs: parsed.briefs.slice(0, limit) };
}
