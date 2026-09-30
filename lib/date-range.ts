/**
 * Eastern-Time-aware date range helpers for the analytics dashboard.
 *
 * All "day" boundaries here are calendar days in America/New_York, not
 * rolling 24-hour windows -- so "Today" always means midnight-to-now in
 * Eastern time, "Yesterday" means the previous ET calendar day, and custom
 * ranges are inclusive ET calendar days. DST-safe: offsets are derived by
 * reading the timezone's own wall-clock parts for a given instant rather
 * than assuming a fixed UTC offset.
 */

export const EASTERN_TIME_ZONE = "America/New_York";

type Ymd = { year: number; month: number; day: number };

function partsOf(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

/** The true UTC offset (ms) of `timeZone` at the instant `ms`, DST-safe. */
function tzOffsetMs(ms: number, timeZone: string): number {
  const p = partsOf(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - ms;
}

/** Converts a Y/M/D midnight in `timeZone` into the equivalent UTC instant (ms), DST-safe. */
export function zonedMidnightToUtcMs(ymd: Ymd, timeZone: string = EASTERN_TIME_ZONE): number {
  const guessUtc = Date.UTC(ymd.year, ymd.month - 1, ymd.day, 0, 0, 0);
  const offset = tzOffsetMs(guessUtc, timeZone);
  return guessUtc - offset;
}

/** The Y/M/D (in `timeZone`) that a given UTC instant falls on. */
export function easternYmdOf(ms: number, timeZone: string = EASTERN_TIME_ZONE): Ymd {
  const p = partsOf(ms, timeZone);
  return { year: p.year, month: p.month, day: p.day };
}

export function ymdToInputValue(ymd: Ymd): string {
  return `${String(ymd.year).padStart(4, "0")}-${String(ymd.month).padStart(2, "0")}-${String(ymd.day).padStart(2, "0")}`;
}

export function parseDateInput(value: string): Ymd | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** Adds `days` calendar days to a Y/M/D (handles month/year rollover via Date.UTC normalization). */
export function addDaysToYmd(ymd: Ymd, days: number): Ymd {
  const d = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export type AnalyticsRangeKey = "today" | "yesterday" | "7" | "30" | "90" | "custom";

export interface AnalyticsRange {
  key: AnalyticsRangeKey;
  /** Inclusive start instant, ms since epoch (UTC). */
  startMs: number;
  /** Exclusive end instant, ms since epoch (UTC) -- clamped to "now". */
  endMs: number;
  /** Whether the trend chart should bucket by hour (single-day ranges) or by day. */
  hourly: boolean;
  label: string;
  /** ET calendar-day strings for defaulting the custom-range date inputs. */
  startDateInput: string;
  endDateInput: string;
}

export function resolveAnalyticsRange(params: { range?: string; start?: string; end?: string }): AnalyticsRange {
  const now = Date.now();
  const todayYmd = easternYmdOf(now);
  const range = params.range;

  if (range === "today") {
    const startMs = zonedMidnightToUtcMs(todayYmd);
    const label = ymdToInputValue(todayYmd);
    return { key: "today", startMs, endMs: now, hourly: true, label: "Today", startDateInput: label, endDateInput: label };
  }

  if (range === "yesterday") {
    const yesterdayYmd = addDaysToYmd(todayYmd, -1);
    const startMs = zonedMidnightToUtcMs(yesterdayYmd);
    const endMs = zonedMidnightToUtcMs(todayYmd);
    const label = ymdToInputValue(yesterdayYmd);
    return { key: "yesterday", startMs, endMs, hourly: true, label: "Yesterday", startDateInput: label, endDateInput: label };
  }

  if (range === "custom") {
    const startYmd = (params.start && parseDateInput(params.start)) || addDaysToYmd(todayYmd, -29);
    const endYmd = (params.end && parseDateInput(params.end)) || todayYmd;
    // Guard against a reversed range.
    const [rangeStartYmd, rangeEndYmd] =
      zonedMidnightToUtcMs(startYmd) <= zonedMidnightToUtcMs(endYmd) ? [startYmd, endYmd] : [endYmd, startYmd];
    const startMs = zonedMidnightToUtcMs(rangeStartYmd);
    const endMsExclusive = zonedMidnightToUtcMs(addDaysToYmd(rangeEndYmd, 1));
    const endMs = Math.min(endMsExclusive, now);
    const sameDay = ymdToInputValue(rangeStartYmd) === ymdToInputValue(rangeEndYmd);
    return {
      key: "custom",
      startMs,
      endMs: Math.max(endMs, startMs + 1),
      hourly: sameDay,
      label: sameDay ? ymdToInputValue(rangeStartYmd) : `${ymdToInputValue(rangeStartYmd)} – ${ymdToInputValue(rangeEndYmd)}`,
      startDateInput: ymdToInputValue(rangeStartYmd),
      endDateInput: ymdToInputValue(rangeEndYmd),
    };
  }

  const days = [7, 30, 90].includes(Number(range)) ? Number(range) : 30;
  const startMs = now - days * 86_400_000;
  return {
    key: String(days) as AnalyticsRangeKey,
    startMs,
    endMs: now,
    hourly: false,
    label: `Last ${days} days`,
    startDateInput: ymdToInputValue(easternYmdOf(startMs)),
    endDateInput: ymdToInputValue(todayYmd),
  };
}

/** Floors an absolute ms instant to the nearest `windowMs` window, for cache-friendly fetch keys. */
export function cacheFriendlySinceMs(ms: number, windowMs = 5 * 60 * 1000): number {
  return Math.floor(ms / windowMs) * windowMs;
}
