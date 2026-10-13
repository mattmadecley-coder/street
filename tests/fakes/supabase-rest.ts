// In-memory stand-in for lib/supabase-rest.ts, used only by tests (see tests/alias-hooks.mjs).
// It understands the small slice of PostgREST the admin code uses: eq/neq/gt/gte/lt/lte/is/not.is/in/like/ilike
// filters, order, limit, on_conflict upserts, return=minimal, and a "table does not exist" error.
import { randomUUID } from "node:crypto";

type Row = Record<string, any>;
const tables = new Map<string, Row[]>();
let identity = 0;

export const CATALOG_CACHE_TAG = "street-catalog";
export const CATALOG_REVALIDATE_SECONDS = 3600;

export function __reset() {
  tables.clear();
  identity = 0;
}
/** Registers a table (so it "exists") and optionally seeds rows. */
export function __table(name: string, rows: Row[] = []) {
  tables.set(name, rows.map((row) => ({ ...row })));
}
export function __rows(name: string): Row[] {
  return (tables.get(name) ?? []).map((row) => ({ ...row }));
}
export function __drop(name: string) {
  tables.delete(name);
}

export function hasSupabaseCatalog() {
  return true;
}

function missing(name: string): never {
  throw new Error(`Could not find the table 'public.${name}' in the schema cache`);
}

const DEFAULTS: Record<string, () => Row> = {
  admin_users: () => ({ id: randomUUID(), must_change_password: false, name: "", totp_secret: null, totp_enabled: false, totp_last_step: null, is_active: true, last_login_at: null, created_by: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  admin_sessions: () => ({ id: randomUUID(), created_at: new Date().toISOString(), last_seen_at: new Date().toISOString(), revoked_at: null, ip: null, user_agent: null }),
  audit_log: () => ({ id: ++identity, at: new Date().toISOString(), target_type: null, target_id: null, summary: "", details: {} }),
  admin_state: () => ({ updated_at: new Date().toISOString() }),
  admin_login_attempts: () => ({ fail_count: 0, locked_until: null, updated_at: new Date().toISOString() }),
};
const UNIQUE: Record<string, string[]> = { admin_users: ["email"], admin_state: ["key"], admin_login_attempts: ["ip"] };

function parse(path: string) {
  const [table, query = ""] = path.split("?");
  const params = query ? query.split("&").map((part) => { const i = part.indexOf("="); return [decodeURIComponent(part.slice(0, i)), decodeURIComponent(part.slice(i + 1))] as const; }) : [];
  return { table, params };
}

function matchesFilter(value: any, spec: string): boolean {
  const dot = spec.indexOf(".");
  const op = spec.slice(0, dot);
  const operand = spec.slice(dot + 1);
  switch (op) {
    case "eq": return String(value) === operand;
    case "neq": return String(value) !== operand;
    case "is": return operand === "null" ? value === null || value === undefined : String(value) === operand;
    case "not": return !matchesFilter(value, operand);
    case "gt": return typeof value === "number" ? value > Number(operand) : String(value) > operand;
    case "gte": return typeof value === "number" ? value >= Number(operand) : String(value) >= operand;
    case "lt": return typeof value === "number" ? value < Number(operand) : String(value) < operand;
    case "lte": return typeof value === "number" ? value <= Number(operand) : String(value) <= operand;
    case "in": return operand.replace(/^\(|\)$/g, "").split(",").includes(String(value));
    case "like":
    case "ilike": {
      const pattern = new RegExp(`^${operand.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`, op === "ilike" ? "i" : "");
      return pattern.test(String(value ?? ""));
    }
    default: throw new Error(`fake REST: unsupported operator ${op}`);
  }
}

function select(rows: Row[], params: ReadonlyArray<readonly [string, string]>) {
  let out = rows;
  for (const [key, spec] of params) {
    if (["select", "order", "limit", "on_conflict"].includes(key)) continue;
    out = out.filter((row) => matchesFilter(row[key], spec));
  }
  const order = params.find(([key]) => key === "order")?.[1];
  if (order) {
    const keys = order.split(",").map((item) => { const [column, direction = "asc"] = item.split("."); return { column, desc: direction === "desc" }; });
    out = [...out].sort((a, b) => {
      for (const { column, desc } of keys) {
        const x = a[column]; const y = b[column];
        if (x === y) continue;
        return ((x ?? "") > (y ?? "") ? 1 : -1) * (desc ? -1 : 1);
      }
      return 0;
    });
  }
  const limit = params.find(([key]) => key === "limit")?.[1];
  return limit ? out.slice(0, Number(limit)) : out;
}

function checkUnique(table: string, rows: Row[], candidate: Row, ignore?: Row) {
  for (const column of UNIQUE[table] ?? []) {
    if (rows.some((row) => row !== ignore && row[column] === candidate[column])) throw new Error(`duplicate key value violates unique constraint "${table}_${column}_key"`);
  }
}

export async function supabaseRest<T>(path: string, options: { method?: string; body?: any; prefer?: string } = {}): Promise<T> {
  const { table, params } = parse(path);
  const rows = tables.get(table) ?? missing(table);
  const method = options.method ?? "GET";
  const minimal = (options.prefer ?? "").includes("return=minimal");

  if (method === "GET") return select(rows, params).map((row) => ({ ...row })) as T;

  if (method === "POST") {
    const conflict = params.find(([key]) => key === "on_conflict")?.[1];
    const merge = (options.prefer ?? "").includes("resolution=merge-duplicates");
    const inputs: Row[] = Array.isArray(options.body) ? options.body : [options.body];
    const saved: Row[] = [];
    for (const input of inputs) {
      const existing = conflict && merge ? rows.find((row) => row[conflict] === input[conflict]) : undefined;
      if (existing) { Object.assign(existing, input); saved.push(existing); continue; }
      const row = { ...(DEFAULTS[table]?.() ?? {}), ...input };
      checkUnique(table, rows, row);
      rows.push(row);
      saved.push(row);
    }
    return (minimal ? null : saved.map((row) => ({ ...row }))) as T;
  }

  if (method === "PATCH") {
    const targets = select(rows, params);
    for (const row of targets) {
      const next = { ...row, ...options.body };
      checkUnique(table, rows, next, row);
      Object.assign(row, options.body);
    }
    return (minimal ? null : targets.map((row) => ({ ...row }))) as T;
  }

  if (method === "DELETE") {
    const targets = new Set(select(rows, params));
    tables.set(table, rows.filter((row) => !targets.has(row)));
    return null as T;
  }
  throw new Error(`fake REST: unsupported method ${method}`);
}

export async function supabaseRestPage<T>(path: string, range: { from: number; to: number }): Promise<{ data: T[]; total: number }> {
  const { table, params } = parse(path);
  const all = select(tables.get(table) ?? missing(table), params.filter(([key]) => key !== "limit"));
  return { data: all.slice(range.from, range.to + 1).map((row) => ({ ...row })) as T[], total: all.length };
}

export async function supabaseRestAll<T>(path: string): Promise<T> {
  return (await supabaseRest<any[]>(path)) as unknown as T;
}
