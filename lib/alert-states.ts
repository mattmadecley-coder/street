import type { Alert } from "@/lib/admin-alert-rules";

/** What an admin has done about an alert rule. Stored under admin_state "alert_states" keyed by rule key. */
export type AlertState = {
  status: "acknowledged" | "snoozed";
  /** For snoozes: when the alert may fire again (ISO). Null for acknowledgements. */
  until: string | null;
  /** The severity at the time, so an acknowledged warning that turns critical shows up again. */
  severity: Alert["severity"];
  at: string;
};

export type AlertStates = Record<string, AlertState>;

export const SNOOZE_CHOICES = [
  { days: 1, label: "Snooze 1 day" },
  { days: 7, label: "Snooze 7 days" },
] as const;

/** Is this alert currently silenced by an acknowledgement or an unexpired snooze? */
export function isAlertSilenced(alert: Alert, states: AlertStates, nowMs: number): AlertState | null {
  const state = states[alert.key];
  if (!state || alert.severity === "info") return null;
  if (state.status === "snoozed") {
    const until = state.until ? new Date(state.until).getTime() : 0;
    return until > nowMs ? state : null;
  }
  // Acknowledged: stays quiet unless the rule got more severe.
  const rank = { info: 0, warning: 1, critical: 2 } as const;
  return rank[alert.severity] > rank[state.severity] ? null : state;
}

export function splitAlerts(alerts: Alert[], states: AlertStates, nowMs: number): { active: Alert[]; silenced: Array<{ alert: Alert; state: AlertState }> } {
  const active: Alert[] = [];
  const silenced: Array<{ alert: Alert; state: AlertState }> = [];
  for (const alert of alerts) {
    const state = isAlertSilenced(alert, states, nowMs);
    if (state) silenced.push({ alert, state });
    else active.push(alert);
  }
  // If silencing removed every real alert, show the "all clear" notice rather than an empty page.
  return { active, silenced };
}

/** Drops expired snoozes so the stored map does not grow forever. */
export function pruneStates(states: AlertStates, nowMs: number): AlertStates {
  const kept: AlertStates = {};
  for (const [key, state] of Object.entries(states)) {
    if (state.status === "snoozed" && (!state.until || new Date(state.until).getTime() <= nowMs)) continue;
    kept[key] = state;
  }
  return kept;
}

export function acknowledge(states: AlertStates, alert: Pick<Alert, "key" | "severity">, nowMs: number): AlertStates {
  return { ...pruneStates(states, nowMs), [alert.key]: { status: "acknowledged", until: null, severity: alert.severity, at: new Date(nowMs).toISOString() } };
}

export function snooze(states: AlertStates, alert: Pick<Alert, "key" | "severity">, days: number, nowMs: number): AlertStates {
  const safeDays = Math.min(Math.max(Math.floor(days), 1), 30);
  return { ...pruneStates(states, nowMs), [alert.key]: { status: "snoozed", until: new Date(nowMs + safeDays * 86_400_000).toISOString(), severity: alert.severity, at: new Date(nowMs).toISOString() } };
}

export function restore(states: AlertStates, key: string): AlertStates {
  const { [key]: _removed, ...rest } = states;
  return rest;
}
