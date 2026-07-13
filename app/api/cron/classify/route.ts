import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { classifyPendingProducts } from "@/lib/catalog-store";
import { CATALOG_CACHE_TAG, CATALOG_REVALIDATE_SECONDS } from "@/lib/supabase-rest";

export const maxDuration = 60;

/**
 * Recovery worker for products left pending when an import's short background
 * classification window expires. It keeps taking bounded batches until the
 * queue is empty or this invocation is close to its serverless time limit.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const deadline = Date.now() + 45_000;
    let batches = 0;
    let processed = 0;
    let failed = 0;
    let changed = false;

    while (Date.now() < deadline) {
      const run = await classifyPendingProducts(20);
      if (!run.results.length) break;

      batches += 1;
      processed += run.results.length;
      failed += run.results.filter((result) => result.status === "error").length;
      changed ||= run.results.some((result) => result.status !== "error");

      if (run.found < run.limit) break;
    }

    if (changed) revalidateTag(CATALOG_CACHE_TAG, { expire: CATALOG_REVALIDATE_SECONDS });

    return NextResponse.json({
      ok: true,
      mode: "classification-recovery",
      ranAt: new Date().toISOString(),
      batches,
      processed,
      failed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Classification recovery failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
