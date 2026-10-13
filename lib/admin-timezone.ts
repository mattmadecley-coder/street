import { hasSupabaseCatalog, supabaseRest } from "@/lib/supabase-rest";
import { isValidTimeZone } from "@/lib/date-range";

const SETTING_KEY = "admin_time_zone";

export const DEFAULT_ADMIN_TIME_ZONE = "America/New_York";

/** Zones offered in Settings. Any valid IANA name also works if it is stored directly. */
export const COMMON_TIME_ZONES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "America/New_York", label: "Eastern Time (New York)" },
  { value: "America/Chicago", label: "Central Time (Chicago)" },
  { value: "America/Denver", label: "Mountain Time (Denver)" },
  { value: "America/Phoenix", label: "Mountain Time, no DST (Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific Time (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska Time (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (Honolulu)" },
  { value: "America/Toronto", label: "Eastern Time (Toronto)" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Central Europe (Paris)" },
  { value: "Asia/Dubai", label: "Gulf (Dubai)" },
  { value: "Asia/Kolkata", label: "India (Kolkata)" },
  { value: "Asia/Tokyo", label: "Japan (Tokyo)" },
  { value: "Australia/Sydney", label: "Sydney" },
  { value: "UTC", label: "UTC" },
];

let cached: { at: number; value: string } | null = null;

/** The store's reporting time zone: used for day boundaries in the date-range picker, Home and Analytics. Cached for 60s. */
export async function getAdminTimeZone(): Promise<string> {
  if (cached && Date.now() - cached.at < 60_000) return cached.value;
  let value = DEFAULT_ADMIN_TIME_ZONE;
  if (hasSupabaseCatalog()) {
    try {
      const rows = await supabaseRest<Array<{ value: string | null }>>(`site_settings?select=value&key=eq.${SETTING_KEY}&limit=1`, { noStore: true });
      const stored = rows[0]?.value;
      if (isValidTimeZone(stored)) value = stored;
    } catch {
      // Settings unreachable: fall back to the default rather than break every dashboard.
    }
  }
  cached = { at: Date.now(), value };
  return value;
}

/** Saves the reporting time zone (validated) and clears the cache. */
export async function setAdminTimeZone(timeZone: string): Promise<void> {
  if (!isValidTimeZone(timeZone)) throw new Error("That is not a valid time zone.");
  if (!hasSupabaseCatalog()) throw new Error("Supabase is not configured.");
  await supabaseRest("site_settings?on_conflict=key", {
    method: "POST",
    body: { key: SETTING_KEY, value: timeZone, updated_at: new Date().toISOString() },
    prefer: "resolution=merge-duplicates,return=minimal",
  });
  cached = null;
}
