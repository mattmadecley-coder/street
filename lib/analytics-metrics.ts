import type { OutboundClickRow, SiteEventRow } from "@/lib/analytics";
import { analyzeAudience, summarizePurchaseIntent } from "@/lib/analytics-audience";

/**
 * One definition of every headline metric, used by Home, Analytics and
 * Compare so they cannot disagree (see lib/analytics-glossary.ts for the
 * plain-English versions shown to people).
 *
 * Click types:
 *  - Product click  : a shopper opened a product page on Street (interest only).
 *  - Brand visit    : outbound hand-off to a brand site with no specific product.
 *  - Product visit  : outbound hand-off to a specific product on the brand site.
 *  - Checkout click : the shopper clicked "Checkout on <brand>" in the bag.
 *  - Bag add        : added to Street's bag. The shopper has not left Street, so it is not a hand-off.
 *
 * "Outbound clicks" = brand visits + product visits + checkout clicks.
 * "High-intent clicks" = product visits + checkout clicks.
 * The same visitor repeating the same hand-off within 30 minutes counts once.
 */
export const DEDUPE_WINDOW_MS = 30 * 60 * 1000;

export type HandoffBreakdown = {
  brandVisits: number;
  productVisits: number;
  checkoutClicks: number;
  /** brandVisits + productVisits + checkoutClicks, after de-duplication. */
  total: number;
  /** productVisits + checkoutClicks. */
  highIntent: number;
  /** Before de-duplication, for transparency. */
  rawTotal: number;
};

export type WindowStats = {
  visitors: number;
  recordedVisitors: number;
  engagedVisitors: number;
  sessions: number;
  engagedSessions: number;
  /** Share of sessions (suspected bots excluded) with a page view that viewed exactly one page and did nothing else; null when there are none. */
  bounceRate: number | null;
  pageViews: number;
  productViews: number;
  productClicks: number;
  impressions: number;
  searches: number;
  zeroResultSearches: number;
  bagAdds: number;
  handoffs: HandoffBreakdown;
  shoppers: number;
  intentValue: number;
};

type Handoff = { key: string; at: number; kind: "brand" | "product" | "checkout"; visitor: string | null };

const ENGAGEMENT_EVENTS = new Set([
  "search", "search_click", "filter_applied", "sort_changed", "product_click", "product_view",
  "add_to_cart", "add_to_cart_blocked", "share_product", "save_product", "cart_checkout_click",
]);

const time = (value: string) => {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Keeps the first of each repeated hand-off (same key) that falls within `windowMs` of the last one kept. */
export function dedupeHandoffs(items: Handoff[], windowMs = DEDUPE_WINDOW_MS): Handoff[] {
  const lastKept = new Map<string, number>();
  const kept: Handoff[] = [];
  for (const item of [...items].sort((a, b) => a.at - b.at)) {
    const last = lastKept.get(item.key);
    if (last !== undefined && item.at - last < windowMs) continue;
    lastKept.set(item.key, item.at);
    kept.push(item);
  }
  return kept;
}

export function buildWindowStats(allEvents: SiteEventRow[], allClicks: OutboundClickRow[]): WindowStats {
  const audience = analyzeAudience(allEvents, allClicks);
  const isHuman = (id: string | null) => Boolean(id && audience.likelyHumanIds.has(id));
  const events = allEvents.filter((event) => isHuman(event.anonymous_user_id));
  const clicks = allClicks.filter((click) => isHuman(click.anonymous_user_id));

  const sessionIds = new Set<string>();
  const engagedSessionIds = new Set<string>();
  for (const event of events) {
    if (!event.session_id) continue;
    sessionIds.add(event.session_id);
    if (["search", "filter_applied", "product_view"].includes(event.event_type)) engagedSessionIds.add(event.session_id);
  }
  for (const click of clicks) {
    if (!click.session_id) continue;
    sessionIds.add(click.session_id);
    engagedSessionIds.add(click.session_id);
  }

  // Bounce rate is measured over every session that is not a suspected bot.
  // The "likely human" filter above deliberately drops passive one-page visits,
  // which are exactly the bounces, so using it here would understate the rate.
  const perSession = new Map<string, { pageViews: number; engaged: boolean }>();
  for (const event of allEvents) {
    if (!event.session_id || (event.anonymous_user_id && audience.suspectedIds.has(event.anonymous_user_id))) continue;
    const row = perSession.get(event.session_id) ?? { pageViews: 0, engaged: false };
    if (event.event_type === "page_view") row.pageViews += 1;
    if (ENGAGEMENT_EVENTS.has(event.event_type)) row.engaged = true;
    perSession.set(event.session_id, row);
  }
  for (const click of allClicks) {
    if (!click.session_id || (click.anonymous_user_id && audience.suspectedIds.has(click.anonymous_user_id))) continue;
    const row = perSession.get(click.session_id);
    if (row) row.engaged = true;
  }
  let withPageView = 0;
  let bounced = 0;
  for (const row of perSession.values()) {
    if (row.pageViews < 1) continue;
    withPageView += 1;
    if (row.pageViews === 1 && !row.engaged) bounced += 1;
  }

  const handoffs: Handoff[] = [];
  for (const click of clicks) {
    handoffs.push({
      key: `${click.anonymous_user_id}::${click.product_slug ?? `brand:${click.brand_slug}`}`,
      at: time(click.created_at),
      kind: click.product_slug ? "product" : "brand",
      visitor: click.anonymous_user_id,
    });
  }
  for (const event of events) {
    if (event.event_type !== "cart_checkout_click") continue;
    handoffs.push({ key: `${event.anonymous_user_id}::checkout:${event.brand_slug ?? "unknown"}`, at: time(event.created_at), kind: "checkout", visitor: event.anonymous_user_id });
  }
  const kept = dedupeHandoffs(handoffs);
  const brandVisits = kept.filter((item) => item.kind === "brand").length;
  const productVisits = kept.filter((item) => item.kind === "product").length;
  const checkoutClicks = kept.filter((item) => item.kind === "checkout").length;

  const count = (type: string) => events.filter((event) => event.event_type === type).length;
  const searches = events.filter((event) => event.event_type === "search");

  return {
    visitors: audience.likelyHumanVisitors,
    recordedVisitors: audience.recordedVisitors,
    engagedVisitors: audience.engagedVisitors,
    sessions: sessionIds.size,
    engagedSessions: engagedSessionIds.size,
    bounceRate: withPageView ? bounced / withPageView : null,
    pageViews: count("page_view"),
    productViews: count("product_view"),
    productClicks: count("product_click"),
    impressions: count("product_impression"),
    searches: searches.length,
    zeroResultSearches: searches.filter((event) => event.results_count === 0).length,
    bagAdds: count("add_to_cart"),
    handoffs: {
      brandVisits,
      productVisits,
      checkoutClicks,
      total: brandVisits + productVisits + checkoutClicks,
      highIntent: productVisits + checkoutClicks,
      rawTotal: handoffs.length,
    },
    shoppers: new Set(kept.map((item) => item.visitor).filter(Boolean)).size,
    intentValue: summarizePurchaseIntent(clicks).intentValue,
  };
}

export const EMPTY_STATS: WindowStats = {
  visitors: 0, recordedVisitors: 0, engagedVisitors: 0, sessions: 0, engagedSessions: 0, bounceRate: null,
  pageViews: 0, productViews: 0, productClicks: 0, impressions: 0, searches: 0, zeroResultSearches: 0, bagAdds: 0,
  handoffs: { brandVisits: 0, productVisits: 0, checkoutClicks: 0, total: 0, highIntent: 0, rawTotal: 0 },
  shoppers: 0, intentValue: 0,
};

/** Rows inside [startMs, endMs). */
export function inWindow<T extends { created_at: string }>(rows: T[], startMs: number, endMs: number): T[] {
  return rows.filter((row) => {
    const at = time(row.created_at);
    return at >= startMs && at < endMs;
  });
}
