import type { Alert } from "@/lib/admin-alert-rules";

/** What the last digest already told the admin about: alert key -> severity at that time. */
export type DigestMemory = Record<string, Alert["severity"]>;

const RANK = { info: 0, warning: 1, critical: 2 } as const;

/**
 * Picks the alerts worth notifying about now: ones the admin has not been told
 * about yet, or ones that got more severe since. An alert that keeps firing day
 * after day produces one notification, not one per day.
 */
export function newAlertsSince(active: Alert[], memory: DigestMemory): Alert[] {
  return active.filter((alert) => alert.severity !== "info" && (!(alert.key in memory) || RANK[alert.severity] > RANK[memory[alert.key]]));
}

/** The memory to store after a digest: exactly the alerts that are active now (so a recurrence notifies again). */
export function nextMemory(active: Alert[]): DigestMemory {
  const memory: DigestMemory = {};
  for (const alert of active) if (alert.severity !== "info") memory[alert.key] = alert.severity;
  return memory;
}

export function formatDigest(fresh: Alert[], activeCount: number, adminUrl: string): { subject: string; text: string; slackText: string } {
  const critical = fresh.filter((alert) => alert.severity === "critical").length;
  const subject = `Street admin: ${fresh.length} new alert${fresh.length === 1 ? "" : "s"}${critical ? ` (${critical} critical)` : ""}`;
  const lines = fresh.map((alert) => `${alert.severity === "critical" ? "CRITICAL" : "Warning"}: ${alert.title} - ${alert.detail}`);
  const footer = `${activeCount} alert${activeCount === 1 ? " is" : "s are"} open in total. Review them: ${adminUrl}/admin/analytics/alerts`;
  const text = `${lines.join("\n\n")}\n\n${footer}`;
  const slackLines = fresh.map((alert) => `${alert.severity === "critical" ? ":rotating_light:" : ":warning:"} *${alert.title}*\n${alert.detail}`);
  return { subject, text, slackText: `${slackLines.join("\n\n")}\n\n<${adminUrl}/admin/analytics/alerts|Open alerts> (${activeCount} open)` };
}
