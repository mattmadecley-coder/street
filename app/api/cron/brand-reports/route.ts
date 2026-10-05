import { NextRequest, NextResponse } from "next/server";
import { runDailyBrandReports } from "@/lib/brand-report";

export const maxDuration = 60;

/**
 * Daily (≈9 AM Eastern, via GitHub Actions): builds yesterday's brand report
 * emails. Drafts wait in /admin/reports unless BRAND_REPORTS_AUTO_SEND=1.
 * Optional ?date=YYYY-MM-DD to (re)build a specific day.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const date = request.nextUrl.searchParams.get("date") ?? undefined;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  try {
    const result = await runDailyBrandReports(date);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Street brand reports failed", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "failed" }, { status: 500 });
  }
}
