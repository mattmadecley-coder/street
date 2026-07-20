import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { runClassificationWorkerBatch } from "@/lib/classification-recovery";
import { triggerClassificationDrain } from "@/lib/classification-trigger";
import { CATALOG_CACHE_TAG, CATALOG_REVALIDATE_SECONDS, supabaseRest } from "@/lib/supabase-rest";

export const maxDuration = 60;
const WORKER_BATCH_SIZE = 8;

async function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") === `Bearer ${secret}`) return true;

  const watchdogToken = request.headers.get("x-street-worker-token")?.trim();
  if (!watchdogToken) return false;
  try {
    return await supabaseRest<boolean>("rpc/authorize_classification_worker", {
      method: "POST",
      body: { p_token: watchdogToken },
    });
  } catch (error) {
    console.error("Street classification watchdog authorization failed", error);
    return false;
  }
}

async function drainOneBatch(brandSlug?: string) {
  try {
    const run = await runClassificationWorkerBatch(WORKER_BATCH_SIZE, brandSlug);
    if (run.busy) {
      console.info("Street classification trigger joined an active worker", { brandSlug: brandSlug ?? null });
      return;
    }

    if (run.results.length) {
      revalidateTag(CATALOG_CACHE_TAG, { expire: CATALOG_REVALIDATE_SECONDS });
    }

    // A full batch means there may be more work. Start a fresh invocation only
    // after this bounded batch has completed and released the database lease.
    // Continuations are global so older queued products cannot be stranded by
    // a stream of newer brand-specific imports.
    const shouldContinue = run.found >= run.limit;
    if (shouldContinue) {
      await triggerClassificationDrain();
    }

    console.info("Street classification batch completed", {
      brandSlug: brandSlug ?? null,
      found: run.found,
      processed: run.results.length,
      fallbackCount: run.fallbackCount,
      continued: shouldContinue,
    });
  } catch (error) {
    console.error("Street classification batch failed", error);
  }
}

async function enqueueDrain(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const brandSlug = request.nextUrl.searchParams.get("brand")?.trim() || undefined;
  after(() => drainOneBatch(brandSlug));

  return NextResponse.json(
    {
      ok: true,
      mode: "classification-drain",
      brandSlug: brandSlug ?? null,
      batchSize: WORKER_BATCH_SIZE,
      queuedAt: new Date().toISOString(),
    },
    { status: 202 },
  );
}

/** Cron safety net and manual trigger. */
export async function GET(request: NextRequest) {
  return enqueueDrain(request);
}

/** Internal continuation endpoint used after imports and by prior runs. */
export async function POST(request: NextRequest) {
  return enqueueDrain(request);
}
