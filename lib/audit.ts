import { hasSupabaseCatalog, supabaseRest } from "@/lib/supabase-rest";
import { isMissingTableError } from "@/lib/admin-state";

/** Who did something, as recorded in the audit log. */
export type Actor = { id: string | null; label: string };

export type AuditEntry = {
  /** Dotted action name, e.g. "product.delete", "auth.login". */
  action: string;
  targetType?: string;
  targetId?: string;
  /** One readable sentence: "Deleted product Chains Zip Hoodie". */
  summary: string;
  /** Extra context (submitted field values, counts). Never put secrets here; sensitive keys are stripped anyway. */
  details?: Record<string, unknown>;
};

const SENSITIVE_KEY = /pass(word)?|secret|token|totp|hash|authorization|cookie|api[_-]?key/i;
const MAX_STRING = 500;

/** Removes anything that looks like a secret and trims long values so one entry cannot bloat the log. */
export function sanitizeDetails(input: unknown, depth = 0): unknown {
  if (input === null || input === undefined) return input;
  if (typeof input === "string") return input.length > MAX_STRING ? `${input.slice(0, MAX_STRING)}…` : input;
  if (typeof input === "number" || typeof input === "boolean") return input;
  if (depth >= 3) return "[nested]";
  if (Array.isArray(input)) return input.slice(0, 50).map((item) => sanitizeDetails(item, depth + 1));
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>).slice(0, 50)) {
      out[key] = SENSITIVE_KEY.test(key) ? "[removed]" : sanitizeDetails(value, depth + 1);
    }
    return out;
  }
  return String(input);
}

/** Turns FormData into a plain object for audit details, dropping file contents and secrets. */
export function formDetails(formData: FormData, skip: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (skip.includes(key) || key.startsWith("$ACTION")) continue;
    out[key] = typeof value === "string" ? value : value instanceof File ? `[file ${value.name}, ${value.size} bytes]` : String(value);
  }
  return out;
}

/**
 * Appends to the audit log. Never throws: if the table is not set up yet (or the database
 * hiccups) the admin action still succeeds and the problem is logged to the server console.
 */
export async function recordAudit(actor: Actor, entry: AuditEntry): Promise<void> {
  if (!hasSupabaseCatalog()) return;
  try {
    await supabaseRest("audit_log", {
      method: "POST",
      body: {
        actor_id: actor.id,
        actor_label: actor.label.slice(0, 200),
        action: entry.action.slice(0, 80),
        target_type: entry.targetType?.slice(0, 40) ?? null,
        target_id: entry.targetId?.slice(0, 120) ?? null,
        summary: entry.summary.slice(0, 300),
        details: sanitizeDetails(entry.details ?? {}),
      },
      prefer: "return=minimal",
    });
  } catch (error) {
    if (!isMissingTableError(error)) console.error("Street audit log write failed", error);
  }
}
