import type { WindowStats } from "@/lib/analytics-metrics";
import { DEFAULT_ALERT_THRESHOLDS, type AlertThresholds } from "@/lib/alert-thresholds";

export type AlertSeverity = "critical" | "warning" | "info";

/** Every rule key evaluateAlertRules can emit (besides the "all-clear" notice). Used to validate form input. */
export const ALERT_RULE_KEYS = ["analytics-stopped", "traffic-drop", "outbound-drop", "technical-errors", "broken-images", "weak-ctr", "zero-results", "stale-brands"] as const;

export type Alert = {
  /** Stable id of the rule that fired, used to acknowledge or snooze it. */
  key: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  href?: string;
  action?: string;
};

/** Kept for existing imports; the live value comes from the editable thresholds. */
export const STALE_SYNC_DAYS = DEFAULT_ALERT_THRESHOLDS.staleSyncDays;

export type AlertInput = {
  nowMs: number;
  /** Timestamp of the newest tracked event, 0 when there has never been one. */
  latestEventAtMs: number;
  /** Last 7 complete days. */
  current: WindowStats;
  /** The 7 days before those. */
  previous: WindowStats;
  /** javascript_error + unhandled_rejection + broken_image events in the last 7 days. */
  technicalErrors: number;
  brokenImages: number;
  staleBrandNames: string[];
};

const percent = (value: number, total: number) => (total ? (value / total) * 100 : 0);

/** Pure rule evaluation: same inputs always give the same alerts. */
export function evaluateAlertRules(input: AlertInput, thresholds: AlertThresholds = DEFAULT_ALERT_THRESHOLDS): Alert[] {
  const { nowMs, latestEventAtMs, current, previous, technicalErrors, brokenImages, staleBrandNames } = input;
  const t = thresholds;
  const alerts: Alert[] = [];

  if (!latestEventAtMs || nowMs - latestEventAtMs > t.silenceHours * 3600000) {
    alerts.push({ key: "analytics-stopped", severity: "critical", title: "Analytics may have stopped", detail: latestEventAtMs ? `No event received in ${Math.floor((nowMs - latestEventAtMs) / 3600000)} hours.` : "No analytics events have been received.", href: "/admin?range=today", action: "Open today's dashboard" });
  }
  if (previous.sessions >= t.trafficMinPrevious && current.sessions < previous.sessions * (1 - t.trafficDropPercent / 100)) {
    alerts.push({ key: "traffic-drop", severity: "warning", title: "Traffic dropped sharply", detail: `Sessions are down ${Math.round(100 - percent(current.sessions, previous.sessions))}% versus the previous seven days.`, href: "/admin/analytics/comparison?range=7", action: "Compare periods" });
  }
  if (previous.handoffs.total >= t.outboundMinPrevious && current.handoffs.total < previous.handoffs.total * (1 - t.outboundDropPercent / 100)) {
    alerts.push({ key: "outbound-drop", severity: "warning", title: "Outbound traffic dropped", detail: `Outbound clicks fell from ${previous.handoffs.total} to ${current.handoffs.total}.`, href: "/admin/analytics/comparison?range=7", action: "Compare periods" });
  }
  if (technicalErrors >= t.errorsCritical) {
    alerts.push({ key: "technical-errors", severity: "critical", title: "Technical errors are elevated", detail: `${technicalErrors} browser or image errors were recorded in the last seven days.`, href: "/admin/analytics?range=7&tab=health", action: "Open tracking health" });
  } else if (technicalErrors >= t.errorsWarning) {
    alerts.push({ key: "technical-errors", severity: "warning", title: "Technical errors need review", detail: `${technicalErrors} browser or image errors were recorded in the last seven days.`, href: "/admin/analytics?range=7&tab=health", action: "Open tracking health" });
  }
  // Broken images get their own call-out (not just folded into the generic
  // "technical errors" count above) because they have a direct, one-click
  // fix -- Sync now on the affected brand -- the way a stray JS error
  // usually doesn't. See the Moojimoojius fix (2026-10-01): 150 products hid
  // behind a single bucket for months because nothing singled this out.
  if (brokenImages >= t.brokenImagesCritical) {
    alerts.push({ key: "broken-images", severity: "critical", title: "Broken product images detected", detail: `${brokenImages} broken_image events in the last 7 days. Open Brands and use Sync now on the affected brand(s) to refresh their photos.`, href: "/admin/brands", action: "Open Brands" });
  } else if (brokenImages >= t.brokenImagesWarning) {
    alerts.push({ key: "broken-images", severity: "warning", title: "Some product images are broken", detail: `${brokenImages} broken_image events in the last 7 days. Open Brands to find the affected brand(s).`, href: "/admin/brands", action: "Open Brands" });
  }
  if (current.impressions >= t.ctrMinImpressions && percent(current.productClicks, current.impressions) < t.ctrMinPercent) {
    alerts.push({ key: "weak-ctr", severity: "warning", title: "Product CTR is weak", detail: `Current product CTR is ${percent(current.productClicks, current.impressions).toFixed(1)}%. Review product imagery, ordering, and relevance.`, href: "/admin/analytics?range=7&tab=catalog", action: "Open product performance" });
  }
  if (current.searches >= t.zeroResultMinSearches && percent(current.zeroResultSearches, current.searches) >= t.zeroResultPercent) {
    alerts.push({ key: "zero-results", severity: "warning", title: "Too many searches return nothing", detail: `${percent(current.zeroResultSearches, current.searches).toFixed(1)}% of searches had zero results.`, href: "/admin/analytics?range=7&tab=discovery", action: "See zero-result searches" });
  }
  if (staleBrandNames.length) {
    const count = staleBrandNames.length;
    alerts.push({ key: "stale-brands", severity: count >= 5 ? "critical" : "warning", title: `${count} brand${count === 1 ? "" : "s"} ha${count === 1 ? "s" : "ve"} not synced successfully in ${t.staleSyncDays}+ days`, detail: `${staleBrandNames.slice(0, 8).join(", ")}${count > 8 ? `, and ${count - 8} more` : ""} — open Brands for the reason (source errors, a changed store layout, etc).`, href: "/admin/brands", action: "Open Brands" });
  }
  if (!alerts.length) alerts.push({ key: "all-clear", severity: "info", title: "No urgent analytics alerts", detail: "Traffic, tracking freshness, conversion, broken images, sync freshness, and technical-error thresholds are currently within normal ranges." });

  const order = { critical: 0, warning: 1, info: 2 } as const;
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}
