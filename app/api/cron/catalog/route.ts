import { NextRequest, NextResponse } from "next/server";
import { syncBrandDirectory, syncStreetCatalog } from "@/lib/catalog-store";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    if (request.nextUrl.searchParams.get("mode") === "directory") {
      const results = await syncBrandDirectory();
      const failed = results.filter((result) => !result.ok);
      return NextResponse.json({ ok: failed.length === 0, mode: "directory", syncedAt: new Date().toISOString(), results }, { status: failed.length ? 502 : 200 });
    }

    const batchValue = Number(request.nextUrl.searchParams.get("batch"));
    const sync = await syncStreetCatalog(Number.isInteger(batchValue) && batchValue > 0 ? batchValue : undefined);
    const failed = sync.results.filter((result) => !result.ok);
    return NextResponse.json({ ok: failed.length === 0, mode: "catalog", syncedAt: new Date().toISOString(), batch: sync.batch, batchCount: sync.batchCount, totalEnabled: sync.totalEnabled, brands: sync.brands.map((brand) => brand.slug), results: sync.results }, { status: failed.length ? 502 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Catalog sync failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
