import type { EmailContact } from "@/lib/email-marketing";

/**
 * Audience segments: a saved set of rules over email contacts. A segment is data, not code, so the
 * admin builder, the API/MCP and campaigns all share one definition. `evaluateSegment` is pure.
 */
export const SEGMENT_FIELDS = [
  { value: "source", label: "Signup source" },
  { value: "utm_source", label: "UTM source" },
  { value: "utm_medium", label: "UTM medium" },
  { value: "utm_campaign", label: "UTM campaign" },
  { value: "device_type", label: "Device" },
  { value: "signup_path", label: "Page they signed up on" },
] as const;
export type SegmentField = (typeof SEGMENT_FIELDS)[number]["value"];

export const ENGAGEMENT_METRICS = [
  { value: "emails_sent", label: "Emails received" },
  { value: "open_count", label: "Emails opened" },
  { value: "click_count", label: "Emails clicked" },
] as const;
export type EngagementMetric = (typeof ENGAGEMENT_METRICS)[number]["value"];

export const CONTACT_STATUSES = ["subscribed", "unsubscribed", "bounced", "complained"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export type SegmentCondition =
  | { type: "status"; op: "is" | "is_not"; value: ContactStatus }
  | { type: "field"; field: SegmentField; op: "is" | "is_not" | "contains" | "is_empty" | "is_not_empty"; value?: string }
  | { type: "tag"; op: "has" | "has_not"; value: string }
  | { type: "phone"; op: "has" | "has_not" }
  | { type: "signed_up"; op: "within_days" | "older_than_days"; days: number }
  | { type: "engagement"; metric: EngagementMetric; op: "gte" | "lte" | "eq"; value: number }
  | { type: "last_opened"; op: "within_days" | "not_within_days" | "never"; days?: number }
  | { type: "last_clicked"; op: "within_days" | "not_within_days" | "never"; days?: number };

export type SegmentDefinition = { match: "all" | "any"; conditions: SegmentCondition[] };

export const MAX_CONDITIONS = 20;
const DAY = 86_400_000;

export const EMPTY_DEFINITION: SegmentDefinition = { match: "all", conditions: [] };

const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
const wholeNumber = (value: unknown, min: number, max: number): number | null => {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};
const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): T | null => (typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null);

/** Validates one condition from untrusted input. Returns null when it is unusable. */
export function cleanCondition(input: unknown): SegmentCondition | null {
  if (typeof input !== "object" || !input) return null;
  const raw = input as Record<string, unknown>;
  switch (raw.type) {
    case "status": {
      const op = oneOf(raw.op, ["is", "is_not"] as const);
      const value = oneOf(raw.value, CONTACT_STATUSES);
      return op && value ? { type: "status", op, value } : null;
    }
    case "field": {
      const field = oneOf(raw.field, SEGMENT_FIELDS.map((f) => f.value));
      const op = oneOf(raw.op, ["is", "is_not", "contains", "is_empty", "is_not_empty"] as const);
      if (!field || !op) return null;
      if (op === "is_empty" || op === "is_not_empty") return { type: "field", field, op };
      const value = text(raw.value, 120);
      return value ? { type: "field", field, op, value } : null;
    }
    case "tag": {
      const op = oneOf(raw.op, ["has", "has_not"] as const);
      const value = text(raw.value, 40);
      return op && value ? { type: "tag", op, value } : null;
    }
    case "phone": {
      const op = oneOf(raw.op, ["has", "has_not"] as const);
      return op ? { type: "phone", op } : null;
    }
    case "signed_up": {
      const op = oneOf(raw.op, ["within_days", "older_than_days"] as const);
      const days = wholeNumber(raw.days, 1, 3650);
      return op && days !== null ? { type: "signed_up", op, days } : null;
    }
    case "engagement": {
      const metric = oneOf(raw.metric, ENGAGEMENT_METRICS.map((m) => m.value));
      const op = oneOf(raw.op, ["gte", "lte", "eq"] as const);
      const value = wholeNumber(raw.value, 0, 100000);
      return metric && op && value !== null ? { type: "engagement", metric, op, value } : null;
    }
    case "last_opened":
    case "last_clicked": {
      const op = oneOf(raw.op, ["within_days", "not_within_days", "never"] as const);
      if (!op) return null;
      if (op === "never") return { type: raw.type, op };
      const days = wholeNumber(raw.days, 1, 3650);
      return days !== null ? { type: raw.type, op, days } : null;
    }
    default:
      return null;
  }
}

export type CleanResult = { definition: SegmentDefinition; dropped: number };

/** Validates a whole definition. Unusable conditions are dropped (and counted) rather than failing everything. */
export function cleanDefinition(input: unknown): CleanResult {
  const raw = (typeof input === "object" && input ? input : {}) as Record<string, unknown>;
  const list = Array.isArray(raw.conditions) ? raw.conditions : [];
  const conditions: SegmentCondition[] = [];
  let dropped = 0;
  for (const item of list.slice(0, MAX_CONDITIONS)) {
    const condition = cleanCondition(item);
    if (condition) conditions.push(condition);
    else dropped += 1;
  }
  dropped += Math.max(0, list.length - MAX_CONDITIONS);
  return { definition: { match: raw.match === "any" ? "any" : "all", conditions }, dropped };
}

const fieldValue = (contact: Pick<EmailContact, SegmentField>, field: SegmentField) => (contact[field] ?? "").toString();

function withinDays(iso: string | null, days: number, nowMs: number) {
  if (!iso) return false;
  const at = Date.parse(iso);
  return Number.isFinite(at) && nowMs - at <= days * DAY && at <= nowMs + DAY;
}

type SegmentContact = Pick<EmailContact, "status" | "phone" | "tags" | "created_at" | "emails_sent" | "open_count" | "click_count" | "last_opened_at" | "last_clicked_at" | SegmentField>;

export function matchesCondition(condition: SegmentCondition, contact: SegmentContact, nowMs: number): boolean {
  switch (condition.type) {
    case "status":
      return (contact.status === condition.value) === (condition.op === "is");
    case "field": {
      const value = fieldValue(contact, condition.field).toLowerCase();
      const wanted = (condition.value ?? "").toLowerCase();
      if (condition.op === "is") return value === wanted;
      if (condition.op === "is_not") return value !== wanted;
      if (condition.op === "contains") return value.includes(wanted);
      if (condition.op === "is_empty") return value === "";
      return value !== "";
    }
    case "tag": {
      const has = (contact.tags ?? []).some((tag) => tag.toLowerCase() === condition.value.toLowerCase());
      return condition.op === "has" ? has : !has;
    }
    case "phone": {
      const has = Boolean(contact.phone);
      return condition.op === "has" ? has : !has;
    }
    case "signed_up": {
      const age = nowMs - Date.parse(contact.created_at);
      return condition.op === "within_days" ? age <= condition.days * DAY : age > condition.days * DAY;
    }
    case "engagement": {
      const have = contact[condition.metric] ?? 0;
      if (condition.op === "gte") return have >= condition.value;
      if (condition.op === "lte") return have <= condition.value;
      return have === condition.value;
    }
    case "last_opened":
    case "last_clicked": {
      const at = condition.type === "last_opened" ? contact.last_opened_at : contact.last_clicked_at;
      if (condition.op === "never") return !at;
      const recent = withinDays(at, condition.days ?? 0, nowMs);
      return condition.op === "within_days" ? recent : !recent;
    }
  }
}

/** An empty rule list matches everyone (the whole audience). */
export function evaluateSegment(definition: SegmentDefinition, contact: SegmentContact, nowMs: number = Date.now()): boolean {
  if (!definition.conditions.length) return true;
  const test = (condition: SegmentCondition) => matchesCondition(condition, contact, nowMs);
  return definition.match === "any" ? definition.conditions.some(test) : definition.conditions.every(test);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** One plain-English line per condition, for lists and previews. */
export function describeCondition(condition: SegmentCondition): string {
  switch (condition.type) {
    case "status": return `Status ${condition.op === "is" ? "is" : "is not"} ${condition.value}`;
    case "field": {
      const label = SEGMENT_FIELDS.find((f) => f.value === condition.field)?.label ?? condition.field;
      if (condition.op === "is_empty") return `${label} is empty`;
      if (condition.op === "is_not_empty") return `${label} is set`;
      return `${label} ${condition.op === "is" ? "is" : condition.op === "is_not" ? "is not" : "contains"} “${condition.value}”`;
    }
    case "tag": return condition.op === "has" ? `Has the tag “${condition.value}”` : `Does not have the tag “${condition.value}”`;
    case "phone": return condition.op === "has" ? "Gave a phone number" : "Has no phone number";
    case "signed_up": return condition.op === "within_days" ? `Signed up in the last ${plural(condition.days, "day")}` : `Signed up more than ${plural(condition.days, "day")} ago`;
    case "engagement": {
      const label = (ENGAGEMENT_METRICS.find((m) => m.value === condition.metric)?.label ?? condition.metric).toLowerCase();
      const op = condition.op === "gte" ? "at least" : condition.op === "lte" ? "at most" : "exactly";
      return `${label[0].toUpperCase()}${label.slice(1)}: ${op} ${condition.value}`;
    }
    case "last_opened":
    case "last_clicked": {
      const what = condition.type === "last_opened" ? "opened" : "clicked";
      if (condition.op === "never") return `Never ${what} an email`;
      return condition.op === "within_days" ? `${what[0].toUpperCase()}${what.slice(1)} an email in the last ${plural(condition.days ?? 0, "day")}` : `Has not ${what} an email in ${plural(condition.days ?? 0, "day")}`;
    }
  }
}

export function describeDefinition(definition: SegmentDefinition): string {
  if (!definition.conditions.length) return "Everyone";
  return definition.conditions.map(describeCondition).join(definition.match === "any" ? " OR " : " AND ");
}

/** Ready-made starting points shown in the builder, so a new segment is one click. */
export const SEGMENT_PRESETS: Array<{ key: string; name: string; description: string; definition: SegmentDefinition }> = [
  { key: "subscribers", name: "All subscribers", description: "Everyone who is currently subscribed.", definition: { match: "all", conditions: [{ type: "status", op: "is", value: "subscribed" }] } },
  { key: "new-30", name: "New in the last 30 days", description: "Subscribed and signed up recently.", definition: { match: "all", conditions: [{ type: "status", op: "is", value: "subscribed" }, { type: "signed_up", op: "within_days", days: 30 }] } },
  { key: "engaged-30", name: "Opened in the last 30 days", description: "Your most engaged subscribers.", definition: { match: "all", conditions: [{ type: "status", op: "is", value: "subscribed" }, { type: "last_opened", op: "within_days", days: 30 }] } },
  { key: "cold-90", name: "Quiet for 90 days", description: "Subscribed, but have not opened anything in 90 days.", definition: { match: "all", conditions: [{ type: "status", op: "is", value: "subscribed" }, { type: "last_opened", op: "not_within_days", days: 90 }, { type: "signed_up", op: "older_than_days", days: 90 }] } },
  { key: "never-opened", name: "Never opened an email", description: "Received emails but never opened one.", definition: { match: "all", conditions: [{ type: "status", op: "is", value: "subscribed" }, { type: "engagement", metric: "emails_sent", op: "gte", value: 1 }, { type: "last_opened", op: "never" }] } },
  { key: "phone", name: "Gave a phone number", description: "Subscribers who also shared a phone number.", definition: { match: "all", conditions: [{ type: "status", op: "is", value: "subscribed" }, { type: "phone", op: "has" }] } },
];


export type SegmentContactRow = Pick<EmailContact, "id" | "email" | "status" | "phone" | "tags" | "created_at" | "emails_sent" | "open_count" | "click_count" | "last_opened_at" | "last_clicked_at" | SegmentField>;

export type SegmentSummary = { total: number; sendable: number; sample: Array<{ id: string; email: string; status: string }> };

/** Counts matching contacts. `sendable` is those still subscribed, which is who a campaign could actually reach. */
export function summarizeSegment(definition: SegmentDefinition, contacts: SegmentContactRow[], nowMs: number = Date.now(), sampleSize = 8): SegmentSummary {
  const matched = contacts.filter((contact) => evaluateSegment(definition, contact, nowMs));
  return {
    total: matched.length,
    sendable: matched.filter((contact) => contact.status === "subscribed").length,
    sample: matched.slice(0, sampleSize).map((contact) => ({ id: contact.id, email: contact.email, status: contact.status })),
  };
}
