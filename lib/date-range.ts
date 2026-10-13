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

export type RangeKey = "today" | "yesterday" | "7" | "30" | "90" | "mtd" | "last_month" | "ytd" | "custom";
export type CompareMode = "none" | "previous" | "year";
/** @deprecated kept so older imports keep compiling; use RangeKey. */
export type AnalyticsRangeKey = RangeKey;

export const DEFAULT_RANGE_KEY: RangeKey = "7";
export const DEFAULT_COMPARE_MODE: CompareMode = "previous";

/** The presets offered by the date-range picker, in display order. */
export const RANGE_PRESETS: ReadonlyArray<{ key: Exclude<RangeKey, "custom">; label: string }> = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7", label: "Last 7 days" },
  { key: "30", label: "Last 30 days" },
  { key: "90", label: "Last 90 days" },
  { key: "mtd", label: "Month to date" },
  { key: "last_month", label: "Last month" },
  { key: "ytd", label: "Year to date" },
];

export interface ResolvedCompare {
  mode: Exclude<CompareMode, "none">;
  label: string;
  startMs: number;
  /** Exclusive. For an in-progress range this is cut to the same elapsed time, so "today so far" compares with "yesterday by this time". */
  endMs: number;
  startDateInput: string;
  endDateInput: string;
}

export interface DateRange {
  key: RangeKey;
  /** Inclusive start instant, ms since epoch (UTC). */
  startMs: number;
  /** Exclusive end instant, ms since epoch (UTC) -- clamped to "now". */
  endMs: number;
  /** Whether trend charts should bucket by hour (single-day ranges) or by day. */
  hourly: boolean;
  label: string;
  timeZone: string;
  /** Local calendar days (inclusive) for date inputs. */
  startDateInput: string;
  endDateInput: string;
  /** True when the range includes the current, still-running day. */
  inProgress: boolean;
  compare: ResolvedCompare | null;
}

/** @deprecated same shape as DateRange; kept for existing imports. */
export type AnalyticsRange = DateRange;

const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const LONG_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function ymdToUtcDate(ymd: Ymd): Date {
  return new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day));
}

function formatSpan(start: Ymd, end: Ymd): string {
  if (sameYmd(start, end)) return LONG_DATE.format(ymdToUtcDate(start));
  if (start.year === end.year) return `${SHORT_DATE.format(ymdToUtcDate(start))} – ${LONG_DATE.format(ymdToUtcDate(end))}`;
  return `${LONG_DATE.format(ymdToUtcDate(start))} – ${LONG_DATE.format(ymdToUtcDate(end))}`;
}

function daysInclusive(start: Ymd, end: Ymd): number {
  return Math.round((Date.UTC(end.year, end.month - 1, end.day) - Date.UTC(start.year, start.month - 1, start.day)) / 86_400_000) + 1;
}

function shiftYears(ymd: Ymd, years: number): Ymd {
  const year = ymd.year + years;
  const lastDay = new Date(Date.UTC(year, ymd.month, 0)).getUTCDate();
  return { year, month: ymd.month, day: Math.min(ymd.day, lastDay) };
}

function sameYmd(a: Ymd, b: Ymd) {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

export function isRangeKey(value: unknown): value is RangeKey {
  return typeof value === "string" && ["today", "yesterday", "7", "30", "90", "mtd", "last_month", "ytd", "custom"].includes(value);
}

export function isCompareMode(value: unknown): value is CompareMode {
  return value === "none" || value === "previous" || value === "year";
}

/** True for an IANA time zone name the runtime understands. */
export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Turns a picker selection (URL params) into concrete instants in `timeZone`.
 * Every boundary is a local calendar day, so "Yesterday" or "Last month" are
 * exact local days even across DST changes. Unknown input falls back to the
 * default preset rather than throwing.
 */
export function resolveDateRange(
  params: { range?: string; start?: string; end?: string; compare?: string },
  options: { timeZone?: string; nowMs?: number } = {},
): DateRange {
  const timeZone = isValidTimeZone(options.timeZone) ? options.timeZone : EASTERN_TIME_ZONE;
  const now = options.nowMs ?? Date.now();
  const today = easternYmdOf(now, timeZone);

  // Legacy links used ?range=1 for "today".
  const requested = params.range === "1" ? "today" : params.range;
  const key: RangeKey = isRangeKey(requested) ? requested : DEFAULT_RANGE_KEY;

  let startYmd: Ymd;
  let endYmd: Ymd;
  switch (key) {
    case "today":
      startYmd = endYmd = today;
      break;
    case "yesterday":
      startYmd = endYmd = addDaysToYmd(today, -1);
      break;
    case "mtd":
      startYmd = { year: today.year, month: today.month, day: 1 };
      endYmd = today;
      break;
    case "last_month": {
      const firstThisMonth = { year: today.year, month: today.month, day: 1 };
      endYmd = addDaysToYmd(firstThisMonth, -1);
      startYmd = { year: endYmd.year, month: endYmd.month, day: 1 };
      break;
    }
    case "ytd":
      startYmd = { year: today.year, month: 1, day: 1 };
      endYmd = today;
      break;
    case "custom": {
      const parsedStart = (params.start && parseDateInput(params.start)) || addDaysToYmd(today, -29);
      const parsedEnd = (params.end && parseDateInput(params.end)) || today;
      const ordered = zonedMidnightToUtcMs(parsedStart, timeZone) <= zonedMidnightToUtcMs(parsedEnd, timeZone);
      startYmd = ordered ? parsedStart : parsedEnd;
      endYmd = ordered ? parsedEnd : parsedStart;
      break;
    }
    default: {
      const days = Number(key);
      startYmd = addDaysToYmd(today, -(days - 1));
      endYmd = today;
    }
  }

  const startMs = zonedMidnightToUtcMs(startYmd, timeZone);
  const endExclusive = zonedMidnightToUtcMs(addDaysToYmd(endYmd, 1), timeZone);
  // A custom range that starts in the future would be empty/negative; keep it at least 1ms wide.
  const endMs = Math.max(Math.min(endExclusive, now), startMs + 1);
  const inProgress = endExclusive > now;
  const hourly = sameYmd(startYmd, endYmd);

  const preset = RANGE_PRESETS.find((item) => item.key === key);
  const label = preset ? preset.label : formatSpan(startYmd, endYmd);

  const compareMode: CompareMode = isCompareMode(params.compare) ? params.compare : DEFAULT_COMPARE_MODE;
  let compare: ResolvedCompare | null = null;
  if (compareMode !== "none") {
    let cStart: Ymd;
    let cEnd: Ymd;
    if (compareMode === "year") {
      cStart = shiftYears(startYmd, -1);
      cEnd = shiftYears(endYmd, -1);
    } else {
      const length = daysInclusive(startYmd, endYmd);
      cEnd = addDaysToYmd(startYmd, -1);
      cStart = addDaysToYmd(cEnd, -(length - 1));
    }
    const cStartMs = zonedMidnightToUtcMs(cStart, timeZone);
    const cFullEnd = zonedMidnightToUtcMs(addDaysToYmd(cEnd, 1), timeZone);
    const cEndMs = inProgress ? Math.min(cFullEnd, cStartMs + (endMs - startMs)) : cFullEnd;
    compare = {
      mode: compareMode,
      label: compareMode === "year" ? `Same period last year (${formatSpan(cStart, cEnd)})` : `Previous period (${formatSpan(cStart, cEnd)})`,
      startMs: cStartMs,
      endMs: Math.max(cEndMs, cStartMs + 1),
      startDateInput: ymdToInputValue(cStart),
      endDateInput: ymdToInputValue(cEnd),
    };
  }

  return {
    key,
    startMs,
    endMs,
    hourly,
    label,
    timeZone,
    startDateInput: ymdToInputValue(startYmd),
    endDateInput: ymdToInputValue(endYmd),
    inProgress,
    compare,
  };
}

/** Back-compatible entry point used by older pages and the CSV export. */
export function resolveAnalyticsRange(params: { range?: string; start?: string; end?: string; compare?: string }, options: { timeZone?: string; nowMs?: number } = {}): DateRange {
  return resolveDateRange(params, options);
}

/** UTC calendar-day bounds ("YYYY-MM-DD", end exclusive) for pages that read the per-day summary views. */
export function rangeUtcDays(range: { startMs: number; endMs: number }): { startDay: string; endDay: string } {
  return {
    startDay: new Date(range.startMs).toISOString().slice(0, 10),
    endDay: new Date(range.endMs).toISOString().slice(0, 10),
  };
}

/** Short zone name for UI, e.g. "Eastern Time". */
export function timeZoneLabel(timeZone: string, at: number = Date.now()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "long" }).formatToParts(new Date(at));
    const name = parts.find((part) => part.type === "timeZoneName")?.value ?? timeZone;
    return name.replace(/ (Standard|Daylight|Summer) Time$/, " Time");
  } catch {
    return timeZone;
  }
}

/** Floors an absolute ms instant to the nearest `windowMs` window, for cache-friendly fetch keys. */
export function cacheFriendlySinceMs(ms: number, windowMs = 5 * 60 * 1000): number {
  return Math.floor(ms / windowMs) * windowMs;
}
