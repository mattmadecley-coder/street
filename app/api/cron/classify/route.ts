import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { recoverQueuedClassifications } from "@/lib/classification-recovery";
import { triggerClassificationDrain } from "@/lib/classification-trigger";
import { CATALOG_CACHE_TAG, CATALOG_REVALIDATE_SECONDS } from "@/lib/supabase-rest";

export const maxDuration = 60;

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return !secret || request.headers.get("authorization") === `Bearer ${secret}`;
}

async function drainQueue(brandSlug?: string) {
  const deadline = Date.now() + 46_000;
  let batches = 0;
  let processed = 0;
  let fallbackCount = 0;
  let shouldContinue = false;

  while (Date.now() < deadline) {
    const run = await recoverQueuedClassifications(25, brandSlug);
    if (!run.results.length) {
      shouldContinue = false;
      break;
    }

    batches += 1;
    processed += run.results.length;
    fallbackCount += run.fallbackCount;
    shouldContinue = run.found >= run.limit;

    if (!shouldContinue) break;
  }

  if (processed > 0) {
    revalidateTag(CATALOG_CACHE_TAG, { expire: CATALOG_REVALIDATE_SECONDS });
  }

  // A full final batch means there may still be work waiting. Start a fresh
  // serverless invocation so classification continues beyond this request's
  // runtime instead of leaving products pending until the next cron run.
  if (shouldContinue) {
    await triggerClassificationDrain(brandSlug);
  }

  console.info("Street classification drain completed", {
    brandSlug: brandSlug ?? null,
    batches,
    processed,
    fallbackCount,
    continued: shouldContinue,
  });
}

function enqueueDrain(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const brandSlug = request.nextUrl.searchParams.get("brand")?.trim() || undefined;
  after(async () => {
    try {
      await drainQueue(brandSlug);
    } catch (error) {
      console.error("Street classification drain failed", error);
    }
  });

  return NextResponse.json(
    {
      ok: true,
      mode: "classification-drain",
      brandSlug: brandSlug ?? null,
      queuedAt: new Date().toISOString(),
    },
    { status: 202 },
  );
}

/**
 * Cron safety net and manual trigger. Work is handed to `after()` immediately,
 * then chained across new invocations until no pending/error products remain.
 */
export async function GET(request: NextRequest) {
  return enqueueDrain(request);
}

/** Internal continuation endpoint used after brand imports and by prior runs. */
export async function POST(request: NextRequest) {
  return enqueueDrain(request);
}
