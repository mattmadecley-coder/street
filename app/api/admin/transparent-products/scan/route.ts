import { NextRequest, NextResponse } from "next/server";
import { scanTransparentProductPoolBatch } from "@/lib/transparent-products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

/** One-time/internal catalog scan. It is deliberately not exposed to browsers. */
export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const url = new URL(request.url);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const batch = Number(url.searchParams.get("batch") ?? 512);
    const pool = await scanTransparentProductPoolBatch(offset, batch);
    return NextResponse.json({
      ok: true,
      scannedProducts: pool.scannedProducts,
      totalProducts: pool.totalProducts,
      nextOffset: pool.nextOffset,
      complete: pool.complete,
      scannedImages: pool.scannedImages,
      transparentProducts: pool.products.length,
      scannedAt: pool.scannedAt,
    });
  } catch (error) {
    console.error("Transparent product scan failed", error);
    return NextResponse.json({ ok: false, error: "The transparent product scan failed." }, { status: 502 });
  }
}
