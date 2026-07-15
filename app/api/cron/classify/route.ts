import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { recoverQueuedClassifications } from "@/lib/classification-recovery";
import { CATALOG_CACHE_TAG, CATALOG_REVALIDATE_SECONDS } from "@/lib/supabase-rest";

export const maxDuration = 60;

/**
 * Recovery worker for products left pending or errored after catalog imports.
 * Products are classified concurrently, AI failures are retried, and anything
 * still ambiguous receives a broad low-confidence category for admin review
 * instead of remaining stuck forever.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const deadline = Date.now() + 48_000;
    let batches = 0;
    let processed = 0;
    let fallbackCount = 0;

    while (Date.now() < deadline) {
      const run = await recoverQueuedClassifications(25);
      if (!run.results.length) break;

      batches += 1;
      processed += run.results.length;
      fallbackCount += run.fallbackCount;

      if (run.found < run.limit) break;
    }

    if (processed > 0) revalidateTag(CATALOG_CACHE_TAG, { expire: CATALOG_REVALIDATE_SECONDS });

    return NextResponse.json({
      ok: true,
      mode: "classification-recovery",
      ranAt: new Date().toISOString(),
      batches,
      processed,
      fallbackCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Classification recovery failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
