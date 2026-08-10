import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { getBrandBySlug, syncSingleBrand } from "@/lib/catalog-store";
import { triggerClassificationDrain } from "@/lib/classification-trigger";
import { CATALOG_CACHE_TAG, CATALOG_REVALIDATE_SECONDS } from "@/lib/supabase-rest";

export const maxDuration = 60;

/**
 * Invoked by QStash — one call per brand, fanned out from
 * app/api/cron/catalog (see lib/qstash.ts). Keeping each brand in its own
 * invocation, with its own fresh 60s budget, is what lets the daily sync
 * finish reliably regardless of how many brands Street carries, instead of
 * every brand competing for time inside one function.
 *
 * verifySignatureAppRouter checks this request actually came from QStash
 * (using QSTASH_CURRENT_SIGNING_KEY / QSTASH_NEXT_SIGNING_KEY), so there's
 * no separate CRON_SECRET-style check needed here.
 */
async function handler(request: Request) {
  const body = (await request.json().catch(() => null)) as { slug?: string } | null;
  const slug = body?.slug;
  if (!slug) return NextResponse.json({ ok: false, error: "Missing brand slug" }, { status: 400 });

  const brand = await getBrandBySlug(slug);
  if (!brand) return NextResponse.json({ ok: false, error: `Brand not found: ${slug}` }, { status: 404 });

  const result = await syncSingleBrand(brand);
  if (result.ok) {
    revalidateTag(CATALOG_CACHE_TAG, { expire: CATALOG_REVALIDATE_SECONDS });
    await triggerClassificationDrain().catch((error) => console.error("Unable to start Street classification drain", error));
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

export const POST = verifySignatureAppRouter(handler);
