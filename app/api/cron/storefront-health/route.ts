import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { inspectStorefront } from "@/lib/storefront-health";
import { CATALOG_CACHE_TAG, CATALOG_REVALIDATE_SECONDS, supabaseRest } from "@/lib/supabase-rest";

export const maxDuration = 60;

const CONCURRENCY = 6;

type BrandHealthRow = {
  id: string;
  slug: string;
  name: string;
  store_url: string;
  storefront_status: "unknown" | "open" | "closed";
};

async function mapWithConcurrency<T, R>(items: T[], limit: number, callback: (item: T) => Promise<R>) {
  const results: R[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await callback(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const brands = await supabaseRest<BrandHealthRow[]>(
      "brands?select=id,slug,name,store_url,storefront_status&is_active=eq.true&catalog_enabled=eq.true&order=name.asc",
      { noStore: true },
    );

    const results = await mapWithConcurrency(brands, CONCURRENCY, async (brand) => {
      const health = await inspectStorefront(brand.store_url);
      const checkedAt = new Date().toISOString();

      if (health.status === "unknown") {
        await supabaseRest(`brands?id=eq.${brand.id}`, {
          method: "PATCH",
          body: { storefront_checked_at: checkedAt, storefront_status_reason: health.reason ?? null },
          prefer: "return=minimal",
        });
        return { brand: brand.slug, status: "unknown" as const, reason: health.reason };
      }

      await supabaseRest(`brands?id=eq.${brand.id}`, {
        method: "PATCH",
        body: {
          storefront_status: health.status,
          storefront_status_reason: health.reason ?? null,
          storefront_checked_at: checkedAt,
        },
        prefer: "return=minimal",
      });

      if (health.status === "closed") {
        await supabaseRest(`products?brand_id=eq.${brand.id}&is_active=eq.true`, {
          method: "PATCH",
          body: { is_active: false },
          prefer: "return=minimal",
        });
        await supabaseRest("rpc/refresh_brand_product_count", {
          method: "POST",
          body: { target_brand_id: brand.id },
          prefer: "return=minimal",
        });
      }

      return { brand: brand.slug, status: health.status, reason: health.reason };
    });

    if (results.some((result) => result.status === "closed")) {
      await supabaseRest("rpc/refresh_catalog_category_summaries", {
        method: "POST",
        body: {},
        prefer: "return=minimal",
      });
      revalidateTag(CATALOG_CACHE_TAG, { expire: CATALOG_REVALIDATE_SECONDS });
    }

    return NextResponse.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      checked: results.length,
      closed: results.filter((result) => result.status === "closed").length,
      unknown: results.filter((result) => result.status === "unknown").length,
      results,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Storefront health check failed" }, { status: 500 });
  }
}
