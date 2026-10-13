"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import styles from "@/app/admin/admin.module.css";
import { CONTACT_STATUSES, ENGAGEMENT_METRICS, SEGMENT_FIELDS, describeCondition, type SegmentCondition, type SegmentDefinition, type SegmentSummary } from "@/lib/email-segments-core";
import { previewSegmentAction } from "@/app/admin/email/segments/actions";

const KINDS: Array<{ type: SegmentCondition["type"]; label: string }> = [
  { type: "signed_up", label: "When they signed up" },
  { type: "last_opened", label: "Last opened an email" },
  { type: "last_clicked", label: "Last clicked an email" },
  { type: "engagement", label: "How many emails they opened / clicked" },
  { type: "tag", label: "Tag" },
  { type: "phone", label: "Phone number" },
  { type: "field", label: "Where they came from (source, UTM, device)" },
  { type: "status", label: "Subscription status" },
];

function defaultFor(type: SegmentCondition["type"]): SegmentCondition {
  switch (type) {
    case "status": return { type, op: "is", value: "subscribed" };
    case "field": return { type, field: "source", op: "is", value: "" };
    case "tag": return { type, op: "has", value: "" };
    case "phone": return { type, op: "has" };
    case "signed_up": return { type, op: "within_days", days: 30 };
    case "engagement": return { type, metric: "open_count", op: "gte", value: 1 };
    case "last_opened": return { type, op: "within_days", days: 30 };
    case "last_clicked": return { type, op: "within_days", days: 30 };
  }
}

type Props = {
  id?: string;
  initialName: string;
  initialDescription: string;
  initialDefinition: SegmentDefinition;
  saveAction: (formData: FormData) => void | Promise<void>;
  deleteAction?: (formData: FormData) => void | Promise<void>;
  canWrite: boolean;
};

export function SegmentBuilder({ id, initialName, initialDescription, initialDefinition, saveAction, deleteAction, canWrite }: Props) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [match, setMatch] = useState<SegmentDefinition["match"]>(initialDefinition.match);
  const [conditions, setConditions] = useState<SegmentCondition[]>(initialDefinition.conditions);
  const [summary, setSummary] = useState<SegmentSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sequence = useRef(0);

  const definition: SegmentDefinition = { match, conditions };
  const definitionJson = JSON.stringify(definition);

  // Live audience size: re-count shortly after any change.
  useEffect(() => {
    const ticket = ++sequence.current;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await previewSegmentAction(definitionJson);
        if (ticket !== sequence.current) return;
        if (result.ok) { setSummary(result.summary); setError(null); } else setError(result.error);
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [definitionJson]);

  const update = (index: number, next: SegmentCondition) => setConditions((list) => list.map((item, i) => (i === index ? next : item)));
  const remove = (index: number) => setConditions((list) => list.filter((_, i) => i !== index));
  const incomplete = conditions.some((condition) => (condition.type === "tag" && !condition.value.trim()) || (condition.type === "field" && !["is_empty", "is_not_empty"].includes(condition.op) && !(condition.value ?? "").trim()));

  return (
    <div className="u-gap-32">
      <form action={saveAction} className={styles.form}>
        {id ? <input type="hidden" name="id" value={id} /> : null}
        <input type="hidden" name="definition" value={definitionJson} />
        <div className={styles.field}>
          <label htmlFor="seg-name">Name</label>
          <input id="seg-name" name="name" type="text" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required placeholder="e.g. Engaged this month" disabled={!canWrite} />
        </div>
        <div className={styles.field}>
          <label htmlFor="seg-desc">Description (optional)</label>
          <input id="seg-desc" name="description" type="text" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={300} disabled={!canWrite} />
        </div>

        <fieldset className={styles.field} style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 700, marginBottom: 6 }}>Who is in this segment</legend>
          <p className={styles.rowMeta} style={{ marginBottom: 10 }}>
            People who match{" "}
            <select value={match} onChange={(event) => setMatch(event.target.value as SegmentDefinition["match"])} aria-label="Match all or any" disabled={!canWrite}>
              <option value="all">ALL of</option>
              <option value="any">ANY of</option>
            </select>{" "}
            these rules. With no rules, everyone is in.
          </p>

          <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
            {conditions.map((condition, index) => (
              <li key={index} style={{ border: "1px solid var(--adm-border)", borderRadius: "var(--adm-radius)", padding: 12, background: "var(--adm-surface)" }}>
                <div className="u-row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <select value={condition.type} onChange={(event) => update(index, defaultFor(event.target.value as SegmentCondition["type"]))} aria-label={`Rule ${index + 1} type`} disabled={!canWrite}>
                    {KINDS.map((kind) => <option key={kind.type} value={kind.type}>{kind.label}</option>)}
                  </select>
                  <ConditionFields condition={condition} onChange={(next) => update(index, next)} disabled={!canWrite} />
                  {canWrite ? <button type="button" className={styles.buttonSecondary} onClick={() => remove(index)} aria-label={`Remove rule ${index + 1}`}>Remove</button> : null}
                </div>
                <p className={styles.rowMeta} style={{ margin: "6px 0 0" }}>{describeCondition(condition)}</p>
              </li>
            ))}
          </ol>
          {canWrite ? (
            <div className="u-row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button type="button" className={styles.buttonSecondary} onClick={() => setConditions((list) => [...list, defaultFor("signed_up")])} disabled={conditions.length >= 20}>+ Add a rule</button>
            </div>
          ) : null}
        </fieldset>

        <div role="status" aria-live="polite" style={{ border: "1px solid var(--adm-border)", borderRadius: "var(--adm-radius)", padding: 14, background: "var(--adm-surface-2)" }}>
          {error ? <strong className={styles.noticeError}>{error}</strong> : summary ? (
            <>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{summary.sendable.toLocaleString()} <span style={{ fontSize: 14, fontWeight: 600 }}>people you can email</span></p>
              <p className={styles.rowMeta} style={{ margin: "4px 0 0" }}>{summary.total.toLocaleString()} match the rules{summary.total !== summary.sendable ? `, ${(summary.total - summary.sendable).toLocaleString()} of them unsubscribed or bounced and are never emailed` : ""}.{pending ? " Updating…" : ""}</p>
              {summary.sample.length ? <p className={styles.rowMeta} style={{ margin: "8px 0 0" }}>Examples: {summary.sample.map((person) => person.email).join(", ")}</p> : null}
            </>
          ) : <span className={styles.rowMeta}>Counting…</span>}
        </div>

        {canWrite ? (
          <div className={styles.actions}>
            <button type="submit" className={styles.button} disabled={!name.trim() || incomplete}>{id ? "Save segment" : "Create segment"}</button>
          </div>
        ) : null}
        {incomplete ? <p className={styles.rowMeta}>Fill in every rule (a tag or a value) before saving.</p> : null}
      </form>

      {id && deleteAction && canWrite ? (
        <form action={deleteAction}>
          <input type="hidden" name="id" value={id} />
          <button type="submit" className={`${styles.buttonSecondary} ${styles.dangerText}`} onClick={(event) => { if (!window.confirm("Delete this segment? Campaigns that used it will need another audience.")) event.preventDefault(); }}>Delete segment</button>
        </form>
      ) : null}
    </div>
  );
}

function ConditionFields({ condition, onChange, disabled }: { condition: SegmentCondition; onChange: (next: SegmentCondition) => void; disabled: boolean }) {
  const set = (patch: Partial<SegmentCondition>) => onChange({ ...condition, ...patch } as SegmentCondition);
  const number = (value: string, fallback: number) => (value === "" ? fallback : Math.max(0, Math.floor(Number(value)) || 0));
  switch (condition.type) {
    case "signed_up":
      return (
        <>
          <select value={condition.op} onChange={(event) => set({ op: event.target.value as "within_days" })} disabled={disabled} aria-label="Signed up when">
            <option value="within_days">signed up in the last</option>
            <option value="older_than_days">signed up more than</option>
          </select>
          <input type="number" min={1} max={3650} value={condition.days} onChange={(event) => set({ days: Math.max(1, number(event.target.value, 1)) })} style={{ width: 90 }} disabled={disabled} aria-label="Days" /> days{condition.op === "older_than_days" ? " ago" : ""}
        </>
      );
    case "last_opened":
    case "last_clicked":
      return (
        <>
          <select value={condition.op} onChange={(event) => set({ op: event.target.value as "within_days", ...(event.target.value === "never" ? {} : { days: condition.days ?? 30 }) })} disabled={disabled} aria-label="When">
            <option value="within_days">did so in the last</option>
            <option value="not_within_days">has not in the last</option>
            <option value="never">has never</option>
          </select>
          {condition.op !== "never" ? <><input type="number" min={1} max={3650} value={condition.days ?? 30} onChange={(event) => set({ days: Math.max(1, number(event.target.value, 1)) })} style={{ width: 90 }} disabled={disabled} aria-label="Days" /> days</> : null}
        </>
      );
    case "engagement":
      return (
        <>
          <select value={condition.metric} onChange={(event) => set({ metric: event.target.value as typeof condition.metric })} disabled={disabled} aria-label="Measure">
            {ENGAGEMENT_METRICS.map((metric) => <option key={metric.value} value={metric.value}>{metric.label}</option>)}
          </select>
          <select value={condition.op} onChange={(event) => set({ op: event.target.value as typeof condition.op })} disabled={disabled} aria-label="Comparison">
            <option value="gte">at least</option>
            <option value="lte">at most</option>
            <option value="eq">exactly</option>
          </select>
          <input type="number" min={0} value={condition.value} onChange={(event) => set({ value: number(event.target.value, 0) })} style={{ width: 90 }} disabled={disabled} aria-label="Number" />
        </>
      );
    case "tag":
      return (
        <>
          <select value={condition.op} onChange={(event) => set({ op: event.target.value as "has" })} disabled={disabled} aria-label="Has tag">
            <option value="has">has the tag</option>
            <option value="has_not">does not have the tag</option>
          </select>
          <input type="text" value={condition.value} onChange={(event) => set({ value: event.target.value })} maxLength={40} placeholder="tag name" disabled={disabled} aria-label="Tag" />
        </>
      );
    case "phone":
      return (
        <select value={condition.op} onChange={(event) => set({ op: event.target.value as "has" })} disabled={disabled} aria-label="Phone">
          <option value="has">gave a phone number</option>
          <option value="has_not">has no phone number</option>
        </select>
      );
    case "status":
      return (
        <>
          <select value={condition.op} onChange={(event) => set({ op: event.target.value as "is" })} disabled={disabled} aria-label="Is or is not">
            <option value="is">is</option>
            <option value="is_not">is not</option>
          </select>
          <select value={condition.value} onChange={(event) => set({ value: event.target.value as typeof condition.value })} disabled={disabled} aria-label="Status">
            {CONTACT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </>
      );
    case "field":
      return (
        <>
          <select value={condition.field} onChange={(event) => set({ field: event.target.value as typeof condition.field })} disabled={disabled} aria-label="Field">
            {SEGMENT_FIELDS.map((field) => <option key={field.value} value={field.value}>{field.label}</option>)}
          </select>
          <select value={condition.op} onChange={(event) => set({ op: event.target.value as typeof condition.op })} disabled={disabled} aria-label="Comparison">
            <option value="is">is</option>
            <option value="is_not">is not</option>
            <option value="contains">contains</option>
            <option value="is_empty">is empty</option>
            <option value="is_not_empty">is set</option>
          </select>
          {condition.op !== "is_empty" && condition.op !== "is_not_empty" ? <input type="text" value={condition.value ?? ""} onChange={(event) => set({ value: event.target.value })} maxLength={120} placeholder="value" disabled={disabled} aria-label="Value" /> : null}
        </>
      );
  }
}
