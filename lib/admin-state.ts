import { hasSupabaseCatalog, supabaseRest } from "@/lib/supabase-rest";

/**
 * Admin-only key/value state in the `admin_state` table (see
 * supabase/migrations/20261014_admin_state.sql). If the migration has not
 * been applied yet, reads return the fallback with `available: false` and
 * writes throw AdminStateUnavailableError, so callers can show "not enabled
 * yet" instead of failing.
 */
export type AdminStateKey = "email_settings" | "saved_product_filters" | "smart_collection_rules" | "alert_thresholds" | "alert_states" | "analytics_annotations" | "alert_digest" | "brand_meta" | "homepage_history";

export class AdminStateUnavailableError extends Error {
  constructor() {
    super("Admin settings storage is not set up yet. Apply the 20261014_admin_state migration to the database first.");
    this.name = "AdminStateUnavailableError";
  }
}

export function isMissingTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /schema cache|does not exist|PGRST205|42P01/i.test(message);
}

export async function readAdminState<T>(key: AdminStateKey, fallback: T): Promise<{ value: T; available: boolean }> {
  if (!hasSupabaseCatalog()) return { value: fallback, available: false };
  try {
    const rows = await supabaseRest<Array<{ value: T }>>(`admin_state?select=value&key=eq.${key}&limit=1`, { noStore: true });
    return { value: rows[0] ? rows[0].value : fallback, available: true };
  } catch (error) {
    if (isMissingTableError(error)) return { value: fallback, available: false };
    throw error;
  }
}

export async function writeAdminState(key: AdminStateKey, value: unknown): Promise<void> {
  if (!hasSupabaseCatalog()) throw new AdminStateUnavailableError();
  try {
    await supabaseRest("admin_state?on_conflict=key", {
      method: "POST",
      body: { key, value, updated_at: new Date().toISOString() },
      prefer: "resolution=merge-duplicates,return=minimal",
    });
  } catch (error) {
    if (isMissingTableError(error)) throw new AdminStateUnavailableError();
    throw error;
  }
}
