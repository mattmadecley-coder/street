"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RANGE_PRESETS, resolveDateRange, timeZoneLabel, DEFAULT_COMPARE_MODE, isCompareMode, type CompareMode, type RangeKey } from "@/lib/date-range";

const COOKIE = "adm_range";
const COMPARE_OPTIONS: Array<{ value: CompareMode; label: string }> = [
  { value: "previous", label: "Previous period" },
  { value: "year", label: "Same period last year" },
  { value: "none", label: "No comparison" },
];

/** Pages whose numbers follow the picker. Alerts use fixed windows on purpose. */
export function isRangeAwarePath(pathname: string): boolean {
  if (pathname === "/admin") return true;
  if (pathname === "/admin/analytics/alerts") return false;
  return pathname === "/admin/analytics" || pathname.startsWith("/admin/analytics/");
}

function readSavedCookie(): URLSearchParams | null {
  try {
    const match = document.cookie.split("; ").find((part) => part.startsWith(`${COOKIE}=`));
    return match ? new URLSearchParams(decodeURIComponent(match.slice(COOKIE.length + 1))) : null;
  } catch {
    return null;
  }
}

function saveCookie(values: URLSearchParams) {
  try {
    document.cookie = `${COOKIE}=${encodeURIComponent(values.toString())}; Path=/admin; Max-Age=31536000; SameSite=Lax`;
  } catch { /* cookies blocked: the URL still carries the choice */ }
}

/** Shopify-style global date range: Today / Yesterday / Last 7 / Last 30 … plus custom range and a compare toggle. */
export function DateRangePicker({ timeZone }: { timeZone: string }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/admin";
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [saved, setSaved] = useState<URLSearchParams | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setSaved(readSavedCookie()); }, [pathname]);

  const urlRange = params.get("range") ?? (params.get("days") === "1" ? "today" : params.get("days"));
  const selection = useMemo(() => {
    const source = urlRange ? params : saved ?? params;
    return {
      range: (urlRange ?? saved?.get("range") ?? undefined) || undefined,
      start: source.get("start") ?? undefined,
      end: source.get("end") ?? undefined,
      compare: params.get("compare") ?? saved?.get("compare") ?? undefined,
    };
  }, [params, saved, urlRange]);

  const current = useMemo(() => resolveDateRange(selection, { timeZone }), [selection, timeZone]);
  const compareMode: CompareMode = isCompareMode(selection.compare) ? selection.compare : DEFAULT_COMPARE_MODE;

  useEffect(() => {
    if (open) { setCustomStart(current.startDateInput); setCustomEnd(current.endDateInput); }
  }, [open, current.startDateInput, current.endDateInput]);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false); }
    function onKey(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  function apply(next: { range: RangeKey; start?: string; end?: string; compare?: CompareMode }) {
    const query = new URLSearchParams(params.toString());
    query.delete("days");
    query.delete("page");
    query.set("range", next.range);
    if (next.range === "custom" && next.start && next.end) { query.set("start", next.start); query.set("end", next.end); }
    else { query.delete("start"); query.delete("end"); }
    query.set("compare", next.compare ?? compareMode);

    const remember = new URLSearchParams();
    remember.set("range", next.range);
    if (next.range === "custom" && next.start && next.end) { remember.set("start", next.start); remember.set("end", next.end); }
    remember.set("compare", next.compare ?? compareMode);
    saveCookie(remember);
    setSaved(remember);

    setOpen(false);
    router.push(`${pathname}?${query.toString()}`);
  }

  const zoneName = timeZoneLabel(timeZone);
  const customValid = Boolean(customStart && customEnd);

  return (
    <div className="adm-range" ref={rootRef}>
      <button type="button" className="adm-range-btn" onClick={() => setOpen((value) => !value)} aria-haspopup="dialog" aria-expanded={open}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
        <span className="adm-range-text">
          <strong>{current.label}</strong>
          {compareMode !== "none" && current.compare ? <small>vs {compareMode === "year" ? "last year" : "previous period"}</small> : null}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {open ? (
        <div className="adm-range-panel" role="dialog" aria-label="Choose a date range">
          <div className="adm-range-presets" role="group" aria-label="Date range presets">
            {RANGE_PRESETS.map((preset) => {
              const hint = resolveDateRange({ range: preset.key, compare: "none" }, { timeZone });
              const dates = hint.startDateInput === hint.endDateInput ? hint.startDateInput.slice(5) : `${hint.startDateInput.slice(5)} → ${hint.endDateInput.slice(5)}`;
              return (
                <button key={preset.key} type="button" className="adm-range-item" aria-pressed={current.key === preset.key} onClick={() => apply({ range: preset.key })}>
                  <span>{preset.label}</span>
                  <small>{dates}</small>
                </button>
              );
            })}
          </div>

          <div className="adm-range-custom">
            <p className="adm-range-heading">Custom range</p>
            <div className="adm-range-dates">
              <label>From<input type="date" value={customStart} max={customEnd || undefined} onChange={(event) => setCustomStart(event.target.value)} /></label>
              <label>To<input type="date" value={customEnd} min={customStart || undefined} onChange={(event) => setCustomEnd(event.target.value)} /></label>
            </div>
            <button type="button" className="adm-btn" data-size="sm" disabled={!customValid} onClick={() => apply({ range: "custom", start: customStart, end: customEnd })}>Apply custom range</button>
          </div>

          <fieldset className="adm-range-compare">
            <legend className="adm-range-heading">Compare to</legend>
            {COMPARE_OPTIONS.map((option) => (
              <label key={option.value} className="adm-range-radio">
                <input type="radio" name="adm-compare" checked={compareMode === option.value} onChange={() => apply({ range: current.key, start: current.key === "custom" ? current.startDateInput : undefined, end: current.key === "custom" ? current.endDateInput : undefined, compare: option.value })} />
                {option.label}
              </label>
            ))}
          </fieldset>

          <p className="adm-range-foot">Days start and end in <strong>{zoneName}</strong>. <Link href="/admin/settings" onClick={() => setOpen(false)}>Change</Link></p>
        </div>
      ) : null}
    </div>
  );
}
