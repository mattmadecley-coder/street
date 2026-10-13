import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { hasCronSecretAccess } from "@/lib/cron-auth";
import { syncAllSmartCollections } from "@/lib/smart-collections";
import { getAdminTimeZone } from "@/lib/admin-timezone";
import { getEarliestEventMs } from "@/lib/analytics";
import { computeMissingSnapshots, DAILY_BACKFILL_PER_RUN } from "@/lib/analytics-daily";
import { CATALOG_CACHE_TAG, CATALOG_REVALIDATE_SECONDS } from "@/lib/supabase-rest";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Daily housekeeping that is not part of the catalog sync: keeps smart collections up to date and
 * writes the daily analytics roll-ups (a few days per run until it has caught up with history).
 * `?days=N` lets an operator catch up faster (max 60).
 */
export async function GET(request: NextRequest) {
  if (!hasCronSecretAccess(request.headers.get("authorization"))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const requested = Number(request.nextUrl.searchParams.get("days"));
  const maxDays = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 60) : DAILY_BACKFILL_PER_RUN;
  const smart = await syncAllSmartCollections();
  let rollups: { computed: number; available: boolean; remaining: number } | { error: string };
  try {
    const result = await computeMissingSnapshots(await getAdminTimeZone(), Date.now(), maxDays, await getEarliestEventMs());
    rollups = { computed: result.computed.length, available: result.available, remaining: result.remaining };
  } catch (error) {
    rollups = { error: error instanceof Error ? error.message : String(error) };
  }
  if (smart.synced) {
    revalidateTag(CATALOG_CACHE_TAG, { expire: CATALOG_REVALIDATE_SECONDS });
    revalidatePath("/");
  }
  const ok = smart.errors.length === 0 && !("error" in rollups);
  return NextResponse.json({ ok, smartCollections: smart, rollups }, { status: ok ? 200 : 502 });
}
