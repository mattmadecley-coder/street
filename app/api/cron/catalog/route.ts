import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { previewPendingClassifications } from "@/lib/classification-preview";
import { runClassificationWorkerBatch } from "@/lib/classification-recovery";
import { getAllBrands, syncBrandDirectory, syncStreetCatalog } from "@/lib/catalog-store";
import { triggerClassificationDrain } from "@/lib/classification-trigger";
import { enqueueBrandSync, hasQStash } from "@/lib/qstash";
import { CATALOG_CACHE_TAG, CATALOG_REVALIDATE_SECONDS, supabaseRest } from "@/lib/supabase-rest";

export const maxDuration = 60;

async function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") === `Bearer ${secret}`) return true;

  const watchdogToken = request.headers.get("x-street-worker-token")?.trim();
  if (!watchdogToken) return false;
  try {
    return await supabaseRest<boolean>("rpc/authorize_cron_watchdog", {
      method: "POST",
      body: { p_job_key: "catalog", p_token: watchdogToken },
    });
  } catch (error) {
    console.error("Street catalog watchdog authorization failed", error);
    return false;
  }
}

async function handleCatalogCron(request: NextRequest) {
  if (!(await isAuthorized(request))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

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

    const brands = (await getAllBrands()).filter((brand) => brand.catalogEnabled);

    if (!hasQStash()) {
      // Fallback so the catalog still updates (slower — one function syncs
      // every brand serially/concurrently, same as before) if QSTASH_TOKEN
      // is ever missing, instead of silently doing nothing.
      await triggerClassificationDrain().catch((error) => console.error("Unable to wake Street classification drain", error));
      const sync = await syncStreetCatalog();
      const failed = sync.results.filter((result) => !result.ok);
      if (sync.results.some((result) => result.ok)) {
        revalidateTag(CATALOG_CACHE_TAG, { expire: CATALOG_REVALIDATE_SECONDS });
        await triggerClassificationDrain().catch((error) => console.error("Unable to restart Street classification drain after sync", error));
      }
      return NextResponse.json({ ok: failed.length === 0, mode: "catalog-inline-fallback", syncedAt: new Date().toISOString(), totalEnabled: sync.totalEnabled, results: sync.results }, { status: failed.length ? 502 : 200 });
    }

    // Fan out: one QStash job per brand (see app/api/qstash/sync-brand) instead
    // of syncing every brand inside this single 60s function. This route just
    // enqueues — it stays fast no matter how many brands Street carries, and
    // each brand's actual sync gets its own fresh time budget plus QStash's
    // automatic retries if a brand's storefront is briefly unreachable.
    const dispatched: string[] = [];
    const failedDispatch: Array<{ brand: string; error: string }> = [];
    for (const brand of brands) {
      try {
        await enqueueBrandSync(brand.slug);
        dispatched.push(brand.slug);
      } catch (error) {
        failedDispatch.push({ brand: brand.slug, error: error instanceof Error ? error.message : "Enqueue failed" });
      }
    }
    return NextResponse.json(
      { ok: failedDispatch.length === 0, mode: "catalog-dispatch", dispatchedAt: new Date().toISOString(), totalEnabled: brands.length, dispatched, failedDispatch },
      { status: failedDispatch.length ? 502 : 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Catalog sync failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Cron safety net and manual trigger. */
export async function GET(request: NextRequest) {
  return handleCatalogCron(request);
}

/** Watchdog continuation endpoint (net.http_post from Supabase pg_cron). */
export async function POST(request: NextRequest) {
  return handleCatalogCron(request);
}
