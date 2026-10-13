/**
 * One written definition per metric, shown as the "i" tooltip next to every
 * number in the admin. If a metric's calculation changes, change its entry
 * here -- the tooltip is the contract people read.
 */
export const METRIC_GLOSSARY = {
  visitors: "Unique browsers that loaded at least one page. Bots and your own admin browser are excluded on the Overview page.",
  engagedVisitors: "Visitors who viewed 2+ pages, searched, or clicked something.",
  sessions: "A visit. It ends after 30 minutes without activity.",
  bounceRate: "Sessions with a single page view and no search or click, as a share of all sessions. Suspected bots are excluded.",
  productClicks: "A shopper opened a product page on Street. Interest, not a hand-off to a brand.",
  outboundClicks: "Every hand-off to a brand's own website: brand visits, product visits and checkout clicks. The same shopper repeating the same hand-off within 30 minutes counts once. Adding to the bag is tracked separately because the shopper has not left Street yet.",
  highIntentClicks: "Outbound clicks that went to a specific product or to a brand's checkout (product visits + checkout clicks).",
  brandVisits: "Hand-offs to a brand's website that were not for a specific product (for example from a brand page or logo).",
  productVisits: "Hand-offs to a specific product on the brand's own website.",
  checkoutClicks: "Shoppers who clicked \"Checkout\" in Street's bag to finish on the brand's site.",
  bagAdds: "Items added to Street's bag. The shopper is still on Street.",
  shoppers: "Unique visitors who made at least one outbound hand-off.",
  recordedVisitors: "Sum of each day's unique browsers. Someone who visits on 3 different days counts 3 times. Includes bots and your own browser. Days are UTC days.",
  recordedSessions: "Sum of each day's sessions, including bots and your own browser. Days are UTC days.",
  recordedOutbound: "Every outbound click row recorded in the period, including your own browser. Days are UTC days.",
  impressions: "A product card appeared on screen.",
  ctr: "Product clicks divided by product impressions.",
  zeroResultSearches: "Searches that returned no products.",
} as const;

export type MetricKey = keyof typeof METRIC_GLOSSARY;

/** Shown on pages that read the daily summary views, so nobody expects them to match the Overview exactly. */
export const RECORDED_BASIS_NOTE =
  "These totals are raw recorded counts in UTC calendar days and include bots and your own browser. The Analytics Overview shows likely-human traffic in Eastern days, so its numbers will be lower and will not match exactly. Only complete days are compared; today is left out because it is still in progress.";
