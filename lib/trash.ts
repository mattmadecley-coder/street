import { hasSupabaseCatalog, supabaseRest } from "@/lib/supabase-rest";
import { isMissingTableError } from "@/lib/admin-state";

let cached: { at: number; supported: boolean } | null = null;

/**
 * Is the products.deleted_at column there (migration 20261015_admin_accounts)? When it is,
 * "delete" in the admin moves a product to a recoverable trash instead of erasing it. When it is
 * not, the admin keeps its old permanent delete (behind a confirmation) until the migration lands.
 */
export async function trashSupported(): Promise<boolean> {
  if (cached && Date.now() - cached.at < 60_000) return cached.supported;
  let supported = false;
  if (hasSupabaseCatalog()) {
    try {
      await supabaseRest("products?select=deleted_at&limit=1", { noStore: true });
      supported = true;
    } catch (error) {
      if (!isMissingTableError(error)) throw error;
    }
  }
  cached = { at: Date.now(), supported };
  return supported;
}

export function resetTrashSupportCache() {
  cached = null;
}

/** Days a trashed product stays recoverable before an owner is expected to purge it. */
export const TRASH_RETENTION_DAYS = 30;
