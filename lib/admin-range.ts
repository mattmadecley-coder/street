import { cookies } from "next/headers";
import { resolveDateRange, type DateRange } from "@/lib/date-range";
import { getAdminTimeZone } from "@/lib/admin-timezone";

/** Cookie the date-range picker writes so the choice follows the admin across pages. Format: a query string, e.g. `range=30&compare=previous`. */
export const RANGE_COOKIE = "adm_range";

type RangeParams = { range?: string; start?: string; end?: string; compare?: string; days?: string };

function legacyRange(params: RangeParams): string | undefined {
  if (params.range) return params.range;
  const days = Number(params.days);
  if (params.days && [1, 7, 30, 90].includes(days)) return days === 1 ? "today" : String(days);
  return undefined;
}

/**
 * The date range for the current request. Priority: explicit URL params, then
 * the saved picker cookie, then the default (last 7 days vs previous period).
 * Used by every range-aware admin page so they always agree.
 */
export async function getAdminRange(searchParams: RangeParams = {}): Promise<DateRange> {
  const timeZone = await getAdminTimeZone();
  const urlRange = legacyRange(searchParams);

  let saved: URLSearchParams | null = null;
  try {
    const raw = (await cookies()).get(RANGE_COOKIE)?.value;
    if (raw) saved = new URLSearchParams(raw);
  } catch {
    saved = null;
  }

  if (urlRange) {
    return resolveDateRange(
      { range: urlRange, start: searchParams.start, end: searchParams.end, compare: searchParams.compare ?? saved?.get("compare") ?? undefined },
      { timeZone },
    );
  }
  return resolveDateRange(
    { range: saved?.get("range") ?? undefined, start: saved?.get("start") ?? undefined, end: saved?.get("end") ?? undefined, compare: searchParams.compare ?? saved?.get("compare") ?? undefined },
    { timeZone },
  );
}
