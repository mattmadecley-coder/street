import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { syncStreetCatalog } from "@/lib/catalog-store";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (secret && authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await syncStreetCatalog();
    revalidatePath("/", "layout");
    revalidatePath("/catalog");
    revalidatePath("/brands/[slug]", "page");
    revalidatePath("/products/[slug]", "page");
    const failed = results.filter((result) => !result.ok);
    return NextResponse.json({ ok: failed.length === 0, refreshedAt: new Date().toISOString(), results }, { status: failed.length ? 502 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Catalog sync failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
