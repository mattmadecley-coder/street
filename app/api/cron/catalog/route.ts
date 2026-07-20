import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { previewPendingClassifications } from "@/lib/classification-preview";
import { runClassificationWorkerBatch } from "@/lib/classification-recovery";
import { syncBrandDirectory, syncStreetCatalog } from "@/lib/catalog-store";
import { triggerClassificationDrain } from "@/lib/classification-trigger";
import { CATALOG_CACHE_TAG, CATALOG_REVALIDATE_SECONDS } from "@/lib/supabase-rest";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    const mode = request.nextUrl.searchParams.get("mode");
    if (mode === "directory") {
      const results = await syncBrandDirectory();
      const failed = results.filter((result) => !result.ok);
      return NextResponse.json({ ok: failed.length === 0, mode: "directory", syncedAt: new Date().toISOString(), results }, { status: failed.length ? 502 : 200 });
    }

    if (mode === "classify-preview") {
      const requestedLimit = Number(request.nextUrl.searchParams.get("limit"));
      const preview = await previewPendingClassifications(Number.isInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : undefined);
      const failed = preview.results.filter((result) => result.error);
      return NextResponse.json({ ok: failed.length === 0, mode: "classify-preview", previewedAt: new Date().toISOString(), ...preview }, { status: failed.length ? 502 : 200 });
    }

    if (mode === "classify") {
      const requestedLimit = Number(request.nextUrl.searchParams.get("limit"));
      const brandSlug = request.nextUrl.searchParams.get("brand") ?? undefined;
      const run = await runClassificationWorkerBatch(Number.isInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : undefined, brandSlug);
      if (run.results.length) revalidateTag(CATALOG_CACHE_TAG, { expire: CATALOG_REVALIDATE_SECONDS });
      if (!run.busy && run.found >= run.limit) await triggerClassificationDrain();
      return NextResponse.json({ ok: true, mode: "classify", classifiedAt: new Date().toISOString(), ...run }, { status: run.busy ? 202 : 200 });
    }

    // Wake the durable queue before the longer all-brand sync begins. This
    // prevents a slow or interrupted catalog run from postponing an existing
    // backlog until the separate classification safety-net cron.
    await triggerClassificationDrain().catch((error) => console.error("Unable to wake Street classification drain", error));

    // Every enabled brand is attempted on every run (see syncStreetCatalog) —
    // there's no batch/rotation param anymore.
    const sync = await syncStreetCatalog();
    const failed = sync.results.filter((result) => !result.ok);
    // Invalidate cached catalog reads the moment new data lands, so pages
    // don't have to wait out the hourly TTL to show freshly synced data.
    if (sync.results.some((result) => result.ok)) {
      revalidateTag(CATALOG_CACHE_TAG, { expire: CATALOG_REVALIDATE_SECONDS });
      await triggerClassificationDrain().catch((error) => console.error("Unable to restart Street classification drain after sync", error));
    }
    return NextResponse.json({ ok: failed.length === 0, mode: "catalog", syncedAt: new Date().toISOString(), totalEnabled: sync.totalEnabled, results: sync.results }, { status: failed.length ? 502 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Catalog sync failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
