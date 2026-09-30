import { NextRequest } from "next/server";
import { getRecentOutboundClicks, getRecentSiteEvents, type SiteEventRow } from "@/lib/analytics";
import { resolveAnalyticsRange } from "@/lib/date-range";

function csvCell(value: unknown) {
  const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function csv(headers: string[], rows: unknown[][]) {
  return [headers.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\n");
}

function metadataString(event: SiteEventRow, key: string) {
  const value = event.metadata?.[key];
  return typeof value === "string" ? value : null;
}

export async function GET(request: NextRequest) {
  const legacyDays = Number(request.nextUrl.searchParams.get("days"));
  const range = request.nextUrl.searchParams.get("range") ?? (Number.isFinite(legacyDays) && legacyDays > 0 ? String(legacyDays === 1 ? "today" : legacyDays) : undefined);
  const rangeInfo = resolveAnalyticsRange({
    range,
    start: request.nextUrl.searchParams.get("start") ?? undefined,
    end: request.nextUrl.searchParams.get("end") ?? undefined,
  });
  const dataset = request.nextUrl.searchParams.get("dataset") ?? "events";
  const since = new Date(rangeInfo.startMs).toISOString();
  const [rawEvents, rawOutbound] = await Promise.all([getRecentSiteEvents(50000, since), getRecentOutboundClicks(50000, since)]);
  const events = rawEvents.filter((event) => new Date(event.created_at).getTime() < rangeInfo.endMs);
  const outbound = rawOutbound.filter((click) => new Date(click.created_at).getTime() < rangeInfo.endMs);

  let output: string;
  if (dataset === "products") {
    const rows = new Map<string, { title: string; brand: string; impressions: number; clicks: number; views: number; outbound: number }>();
    for (const event of events) {
      if (!event.product_id || !["product_impression", "product_click", "product_view"].includes(event.event_type)) continue;
      const row = rows.get(event.product_id) ?? { title: metadataString(event, "productTitle") ?? event.product_id, brand: event.brand_slug ?? "", impressions: 0, clicks: 0, views: 0, outbound: 0 };
      if (event.event_type === "product_impression") row.impressions += 1;
      if (event.event_type === "product_click") row.clicks += 1;
      if (event.event_type === "product_view") row.views += 1;
      rows.set(event.product_id, row);
    }
    for (const click of outbound) {
      if (!click.product_slug) continue;
      const match = [...rows.entries()].find(([, row]) => row.title === click.product_slug);
      if (match) match[1].outbound += 1;
    }
    output = csv(["product_id", "title", "brand", "impressions", "clicks", "ctr", "views", "outbound", "view_to_outbound"], [...rows.entries()].map(([id, row]) => [id, row.title, row.brand, row.impressions, row.clicks, row.impressions ? row.clicks / row.impressions : 0, row.views, row.outbound, row.views ? row.outbound / row.views : 0]));
  } else if (dataset === "searches") {
    const searches = new Map<string, { searches: number; zeroResults: number; totalResults: number }>();
    for (const event of events) {
      if (event.event_type !== "search" || !event.query) continue;
      const query = event.query.toLowerCase().trim();
      const row = searches.get(query) ?? { searches: 0, zeroResults: 0, totalResults: 0 };
      row.searches += 1;
      if (event.results_count === 0) row.zeroResults += 1;
      row.totalResults += event.results_count ?? 0;
      searches.set(query, row);
    }
    output = csv(["query", "searches", "zero_result_searches", "zero_result_rate", "average_results"], [...searches.entries()].map(([query, row]) => [query, row.searches, row.zeroResults, row.searches ? row.zeroResults / row.searches : 0, row.searches ? row.totalResults / row.searches : 0]));
  } else {
    output = csv(["created_at", "event_type", "anonymous_user_id", "session_id", "path", "query", "results_count", "product_id", "brand_slug", "source_component", "position", "device_type", "utm_source", "utm_campaign", "metadata"], events.map((event) => [event.created_at, event.event_type, event.anonymous_user_id, event.session_id, event.path, event.query, event.results_count, event.product_id, event.brand_slug, event.source_component, event.position, event.device_type, event.utm_source, event.utm_campaign, event.metadata]));
  }

  return new Response(output, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="street-analytics-${dataset}-${rangeInfo.startDateInput}_to_${rangeInfo.endDateInput}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
