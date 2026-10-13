export type ChangeTone = "up" | "down" | "flat" | "none";

/** Describes current-vs-previous honestly: no fake "+100%" when there was nothing to compare against. */
export function describeChange(current: number, previous: number): { text: string; tone: ChangeTone; absolute: number } {
  const absolute = current - previous;
  if (!previous && !current) return { text: "No activity", tone: "none", absolute };
  if (!previous) return { text: "No prior data", tone: "none", absolute };
  const pct = (absolute / previous) * 100;
  if (Math.abs(pct) < 0.05) return { text: "0.0%", tone: "flat", absolute };
  return { text: `${pct > 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`, tone: pct > 0 ? "up" : "down", absolute };
}

/** Percentage-point difference between two rates, or a plain-words reason when either side has no denominator. */
export function describeRateChange(currentNumerator: number, currentDenominator: number, previousNumerator: number, previousDenominator: number): { text: string; tone: ChangeTone } {
  if (!currentDenominator || !previousDenominator) return { text: previousDenominator ? "No activity" : "No prior data", tone: "none" };
  const diff = (currentNumerator / currentDenominator) * 100 - (previousNumerator / previousDenominator) * 100;
  if (Math.abs(diff) < 0.05) return { text: "0.0 pts", tone: "flat" };
  return { text: `${diff > 0 ? "+" : "−"}${Math.abs(diff).toFixed(1)} pts`, tone: diff > 0 ? "up" : "down" };
}

/** For metrics where a drop is good news (bounce rate, zero-result searches): swaps the up/down colors. */
export function lowerIsBetter<T extends { tone: ChangeTone }>(change: T): T {
  if (change.tone === "up") return { ...change, tone: "down" };
  if (change.tone === "down") return { ...change, tone: "up" };
  return change;
}

/** Change between two fractions (0..1, or null when undefined), in percentage points. */
export function describeFractionChange(current: number | null, previous: number | null): { text: string; tone: ChangeTone } {
  if (current === null) return { text: "No activity", tone: "none" };
  if (previous === null) return { text: "No prior data", tone: "none" };
  const diff = (current - previous) * 100;
  if (Math.abs(diff) < 0.05) return { text: "0.0 pts", tone: "flat" };
  return { text: `${diff > 0 ? "+" : "−"}${Math.abs(diff).toFixed(1)} pts`, tone: diff > 0 ? "up" : "down" };
}
