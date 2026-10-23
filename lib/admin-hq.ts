// Data access for the /admin/hq office page. Reads the hq_* tables that the
// GM's nightly sync rebuilds from the hq/ markdown files on Matthew's PC --
// see supabase/migrations/20261023_hq_tables.sql. v1 is read-only: there is
// no write path here on purpose (see hq/product/charter.md "First job").
import { hasSupabaseCatalog, supabaseRest } from "@/lib/supabase-rest";
import { isMissingTableError } from "@/lib/admin-state";

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

/** Keeps departments in the order the business actually runs them, not whatever order the DB returns. */
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
  if (!hasSupabaseCatalog()) return EMPTY_SNAPSHOT;
  try {
    const [departments, openQuestions, openGoals, briefs] = await Promise.all([
      supabaseRest<HqDepartment[]>("hq_departments?select=*", { noStore: true }),
      supabaseRest<HqQuestion[]>("hq_questions?select=*&status=eq.open&order=created_at.desc", { noStore: true }),
      supabaseRest<HqGoal[]>("hq_goals?select=*&status=neq.done&order=updated_at.desc", { noStore: true }),
      supabaseRest<HqBrief[]>("hq_briefs?select=*&order=brief_date.desc&limit=1", { noStore: true }),
    ]);
    return {
      available: true,
      departments: [...departments].sort(byId),
      openQuestions: [...openQuestions].sort(byDepartment),
      openGoals: [...openGoals].sort(byDepartment),
      latestBrief: briefs[0] ?? null,
    };
  } catch (error) {
    if (isMissingTableError(error)) return EMPTY_SNAPSHOT;
    throw error;
  }
}

export async function loadHqDepartments(): Promise<{ available: boolean; departments: HqDepartment[] }> {
  if (!hasSupabaseCatalog()) return { available: false, departments: [] };
  try {
    const departments = await supabaseRest<HqDepartment[]>("hq_departments?select=*", { noStore: true });
    return { available: true, departments: [...departments].sort(byId) };
  } catch (error) {
    if (isMissingTableError(error)) return { available: false, departments: [] };
    throw error;
  }
}

export async function loadHqQuestions(status: HqQuestionStatus | "" = "open"): Promise<{ available: boolean; questions: HqQuestion[] }> {
  if (!hasSupabaseCatalog()) return { available: false, questions: [] };
  try {
    const filter = status ? `&status=eq.${status}` : "";
    const questions = await supabaseRest<HqQuestion[]>(`hq_questions?select=*${filter}&order=created_at.desc`, { noStore: true });
    return { available: true, questions: [...questions].sort(byDepartment) };
  } catch (error) {
    if (isMissingTableError(error)) return { available: false, questions: [] };
    throw error;
  }
}

export type HqDepartmentDetail = {
  department: HqDepartment | null;
  logs: HqLog[];
  questions: HqQuestion[];
  goals: HqGoal[];
};

const EMPTY_DETAIL: HqDepartmentDetail = { department: null, logs: [], questions: [], goals: [] };

export async function loadHqDepartment(id: string): Promise<{ available: boolean; detail: HqDepartmentDetail }> {
  if (!hasSupabaseCatalog()) return { available: false, detail: EMPTY_DETAIL };
  try {
    const encoded = encodeURIComponent(id);
    const [departments, logs, questions, goals] = await Promise.all([
      supabaseRest<HqDepartment[]>(`hq_departments?select=*&id=eq.${encoded}&limit=1`, { noStore: true }),
      supabaseRest<HqLog[]>(`hq_logs?select=*&department=eq.${encoded}&order=ran_at.desc&limit=30`, { noStore: true }),
      supabaseRest<HqQuestion[]>(`hq_questions?select=*&department=eq.${encoded}&order=created_at.desc`, { noStore: true }),
      supabaseRest<HqGoal[]>(`hq_goals?select=*&department=eq.${encoded}&order=updated_at.desc`, { noStore: true }),
    ]);
    return { available: true, detail: { department: departments[0] ?? null, logs, questions, goals } };
  } catch (error) {
    if (isMissingTableError(error)) return { available: false, detail: EMPTY_DETAIL };
    throw error;
  }
}

export async function loadHqBriefs(limit = 30): Promise<{ available: boolean; briefs: HqBrief[] }> {
  if (!hasSupabaseCatalog()) return { available: false, briefs: [] };
  try {
    const briefs = await supabaseRest<HqBrief[]>(`hq_briefs?select=*&order=brief_date.desc&limit=${limit}`, { noStore: true });
    return { available: true, briefs };
  } catch (error) {
    if (isMissingTableError(error)) return { available: false, briefs: [] };
    throw error;
  }
}
