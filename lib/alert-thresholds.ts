/** Every number the alert rules compare against. Editable in Settings (stored in admin_state). */
export type AlertThresholds = {
  /** Hours without any tracked event before "Analytics may have stopped" fires. */
  silenceHours: number;
  /** Sessions must fall by at least this percent versus the previous 7 days... */
  trafficDropPercent: number;
  /** ...and the previous 7 days must have had at least this many sessions. */
  trafficMinPrevious: number;
  outboundDropPercent: number;
  outboundMinPrevious: number;
  errorsWarning: number;
  errorsCritical: number;
  brokenImagesWarning: number;
  brokenImagesCritical: number;
  /** Product CTR alert needs this many impressions and a CTR below ctrMinPercent. */
  ctrMinImpressions: number;
  ctrMinPercent: number;
  zeroResultMinSearches: number;
  zeroResultPercent: number;
  staleSyncDays: number;
};

export const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  silenceHours: 6,
  trafficDropPercent: 40,
  trafficMinPrevious: 10,
  outboundDropPercent: 50,
  outboundMinPrevious: 5,
  errorsWarning: 3,
  errorsCritical: 10,
  brokenImagesWarning: 5,
  brokenImagesCritical: 20,
  ctrMinImpressions: 100,
  ctrMinPercent: 3,
  zeroResultMinSearches: 10,
  zeroResultPercent: 20,
  staleSyncDays: 4,
};

export const THRESHOLD_FIELDS: Array<{ key: keyof AlertThresholds; label: string; help: string; min: number; max: number; unit: string }> = [
  { key: "silenceHours", label: "Tracking silent for", help: "Alert if no events arrive for this long.", min: 1, max: 72, unit: "hours" },
  { key: "trafficDropPercent", label: "Traffic drop", help: "Alert when sessions fall by at least this much versus the previous 7 days.", min: 5, max: 95, unit: "%" },
  { key: "trafficMinPrevious", label: "Traffic baseline", help: "Ignore traffic drops unless the previous 7 days had this many sessions.", min: 1, max: 100000, unit: "sessions" },
  { key: "outboundDropPercent", label: "Outbound click drop", help: "Alert when outbound clicks fall by at least this much.", min: 5, max: 95, unit: "%" },
  { key: "outboundMinPrevious", label: "Outbound baseline", help: "Ignore drops unless the previous 7 days had this many clicks.", min: 1, max: 100000, unit: "clicks" },
  { key: "errorsWarning", label: "Errors: warning at", help: "Browser and image errors in the last 7 days.", min: 1, max: 100000, unit: "errors" },
  { key: "errorsCritical", label: "Errors: critical at", help: "Must be at least the warning level.", min: 1, max: 100000, unit: "errors" },
  { key: "brokenImagesWarning", label: "Broken images: warning at", help: "Broken-image events in the last 7 days.", min: 1, max: 100000, unit: "events" },
  { key: "brokenImagesCritical", label: "Broken images: critical at", help: "Must be at least the warning level.", min: 1, max: 100000, unit: "events" },
  { key: "ctrMinImpressions", label: "Weak CTR needs", help: "Minimum product impressions before CTR is judged.", min: 10, max: 1000000, unit: "impressions" },
  { key: "ctrMinPercent", label: "Weak CTR below", help: "Alert when product click-through is under this.", min: 0.5, max: 50, unit: "%" },
  { key: "zeroResultMinSearches", label: "Empty searches need", help: "Minimum searches before zero-result rate is judged.", min: 1, max: 100000, unit: "searches" },
  { key: "zeroResultPercent", label: "Empty searches at", help: "Alert when this share of searches finds nothing.", min: 1, max: 100, unit: "%" },
  { key: "staleSyncDays", label: "Brand sync stale after", help: "Days without a successful catalog sync.", min: 1, max: 60, unit: "days" },
];

/** Accepts anything (stored JSON, form values) and returns safe numbers; unknown or out-of-range values fall back to defaults. */
export function normalizeThresholds(input: unknown): AlertThresholds {
  const source = typeof input === "object" && input ? (input as Record<string, unknown>) : {};
  const result = { ...DEFAULT_ALERT_THRESHOLDS };
  for (const field of THRESHOLD_FIELDS) {
    const raw = source[field.key];
    const value = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
    if (Number.isFinite(value) && value >= field.min && value <= field.max) result[field.key] = value;
  }
  // A critical level below its warning level would hide the warning entirely.
  if (result.errorsCritical < result.errorsWarning) result.errorsCritical = result.errorsWarning;
  if (result.brokenImagesCritical < result.brokenImagesWarning) result.brokenImagesCritical = result.brokenImagesWarning;
  return result;
}
