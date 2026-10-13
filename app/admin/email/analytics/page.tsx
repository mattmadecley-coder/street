import Link from "next/link";
import styles from "@/app/admin/admin.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { EmailTabs } from "@/components/admin/email-tabs";
import { supabaseRestPage } from "@/lib/supabase-rest";
import { requireUser } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

type PopupEvent = { type: string; anonymous_id: string | null; path: string | null; device_type: string | null; created_at: string };
type ContactLite = { phone: string | null; status: string; source: string | null; utm_source: string | null; utm_campaign: string | null; created_at: string };

const RANGES = [7, 30, 90];
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "-");

async function fetchAll<T>(path: string, cap = 30000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < cap; from += 1000) {
    const { data } = await supabaseRestPage<T>(path, { from, to: from + 999 }, { noStore: true });
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

// "Closed" used to be one event; treat the old name as the email step.
const norm = (type: string) => (type === "closed" ? "closed_email_step" : type);

export default async function AdminEmailAnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser();
  const params = await searchParams;
  const days = RANGES.includes(Number(params.days)) ? Number(params.days) : 30;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [events, contacts] = await Promise.all([
    fetchAll<PopupEvent>(`email_popup_events?select=type,anonymous_id,path,device_type,created_at&created_at=gte.${since}&order=created_at.asc`).catch(() => []),
    fetchAll<ContactLite>(`email_contacts?select=phone,status,source,utm_source,utm_campaign,created_at&created_at=gte.${since}&order=created_at.asc`).catch(() => []),
  ]);

  // People = distinct anonymous ids; events = raw count.
  const people = new Map<string, Set<string>>();
  const counts = new Map<string, number>();
  events.forEach((e, i) => {
    const t = norm(e.type);
    counts.set(t, (counts.get(t) ?? 0) + 1);
    if (!people.has(t)) people.set(t, new Set());
    people.get(t)!.add(e.anonymous_id ?? `anon-${i}`);
  });
  const p = (t: string) => people.get(t)?.size ?? 0;
  const c = (t: string) => counts.get(t) ?? 0;

  const funnel = [
    { label: "Saw the popup", t: "shown" },
    { label: "Started typing their email", t: "email_started" },
    { label: "Entered email and clicked Next", t: "email_submitted" },
    { label: "Started typing their phone number", t: "phone_started" },
    { label: "Entered phone and clicked Finish", t: "phone_submitted" },
  ];
  const shown = p("shown");
  const withPhone = contacts.filter((x) => x.phone).length;

  const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const daily = new Map<string, { shown: number; email: number; phone: number; signups: number }>();
  for (let i = days - 1; i >= 0; i--) daily.set(new Date(Date.now() - i * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/New_York" }), { shown: 0, email: 0, phone: 0, signups: 0 });
  for (const e of events) {
    const d = daily.get(dayKey(e.created_at));
    if (!d) continue;
    if (e.type === "shown") d.shown++;
    if (e.type === "email_submitted") d.email++;
    if (e.type === "phone_submitted") d.phone++;
  }
  for (const x of contacts) { const d = daily.get(dayKey(x.created_at)); if (d) d.signups++; }
  const dailyRows = [...daily.entries()];
  const maxShown = Math.max(1, ...dailyRows.map(([, d]) => d.shown));

  function group(keyOf: (e: PopupEvent) => string) {
    const m = new Map<string, { shown: Set<string>; email: Set<string>; phone: Set<string> }>();
    events.forEach((e, i) => {
      const k = keyOf(e);
      const g = m.get(k) ?? { shown: new Set(), email: new Set(), phone: new Set() };
      const id = e.anonymous_id ?? `anon-${i}`;
      if (e.type === "shown") g.shown.add(id);
      if (e.type === "email_submitted") g.email.add(id);
      if (e.type === "phone_submitted") g.phone.add(id);
      m.set(k, g);
    });
    return [...m.entries()].map(([k, g]) => ({ k, shown: g.shown.size, email: g.email.size, phone: g.phone.size })).filter((r) => r.shown || r.email).sort((a, b) => b.shown - a.shown);
  }
  const byDevice = group((e) => e.device_type ?? "unknown");
  const byPage = group((e) => e.path ?? "unknown").slice(0, 12);

  const bySource = new Map<string, number>();
  for (const x of contacts) {
    const k = x.utm_campaign || x.utm_source || x.source || "direct";
    bySource.set(k, (bySource.get(k) ?? 0) + 1);
  }

  return (
    <div className={styles.shell}>
      <AdminNav active="/admin/email" />
      <h1 className={styles.title}>Email</h1>
      <EmailTabs active="/admin/email/analytics" />
      <div style={{ display: "flex", gap: 8, margin: "0 0 18px", flexWrap: "wrap" }}>
        {RANGES.map((r) => (
          <Link key={r} href={`/admin/email/analytics?days=${r}`} className={r === days ? styles.button : styles.buttonSecondary} style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Last {r} days</Link>
        ))}
      </div>

      <div className={styles.cardGrid}>
        <div className={styles.statCard}><strong>{shown}</strong><span>People who saw it</span></div>
        <div className={styles.statCard}><strong>{p("email_submitted")}</strong><span>Gave an email</span></div>
        <div className={styles.statCard}><strong>{pct(p("email_submitted"), shown)}</strong><span>Email signup rate</span></div>
        <div className={styles.statCard}><strong>{p("phone_submitted")}</strong><span>Added a phone</span></div>
        <div className={styles.statCard}><strong>{pct(p("phone_submitted"), p("email_submitted"))}</strong><span>Phone rate (of emails)</span></div>
        <div className={styles.statCard}><strong>{contacts.length}</strong><span>New customers saved</span></div>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><h2>Popup funnel</h2><p className={styles.rowMeta}>Each row counts different people. Events are the raw number of times it happened.</p></div></div>
        <table className={styles.table}>
          <thead><tr><th>Step</th><th>People</th><th>Events</th><th>Of those who saw it</th><th>From previous step</th><th>Dropped off</th></tr></thead>
          <tbody>
            {funnel.map((f, i) => {
              const now = p(f.t);
              const prev = i === 0 ? null : p(funnel[i - 1].t);
              return (
                <tr key={f.t}>
                  <td>{f.label}</td><td><strong>{now}</strong></td><td>{c(f.t)}</td>
                  <td>{i === 0 ? "-" : pct(now, shown)}</td>
                  <td>{prev === null ? "-" : pct(now, prev)}</td>
                  <td>{prev === null ? "-" : Math.max(0, prev - now)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <table className={styles.table} style={{ marginTop: 18 }}>
          <thead><tr><th>Other outcomes</th><th>People</th><th>Of those who saw it</th></tr></thead>
          <tbody>
            <tr><td>Closed on the email step</td><td>{p("closed_email_step")}</td><td>{pct(p("closed_email_step"), shown)}</td></tr>
            <tr><td>Closed on the phone step</td><td>{p("closed_phone_step")}</td><td>{pct(p("closed_phone_step"), shown)}</td></tr>
            <tr><td>Skipped the phone step</td><td>{p("skipped_phone")}</td><td>{pct(p("skipped_phone"), shown)}</td></tr>
            <tr><td>Email form errors</td><td>{p("email_error")}</td><td>{pct(p("email_error"), shown)}</td></tr>
            <tr><td>Phone form errors</td><td>{p("phone_error")}</td><td>{pct(p("phone_error"), shown)}</td></tr>
          </tbody>
        </table>
        <p className={styles.rowMeta} style={{ marginTop: 10 }}>Of the {contacts.length} customers saved in this period, {withPhone} have a phone number ({pct(withPhone, contacts.length)}).</p>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><h2>By day (Eastern)</h2><p className={styles.rowMeta}>Bars show how many times the popup was shown.</p></div></div>
        <table className={styles.table}>
          <thead><tr><th>Day</th><th>Shown</th><th></th><th>Emails</th><th>Phones</th><th>New customers</th></tr></thead>
          <tbody>
            {[...dailyRows].reverse().map(([day, d]) => (
              <tr key={day}>
                <td>{day}</td><td>{d.shown}</td>
                <td><div className={styles.miniBarTrack}><div className={styles.miniBarFill} style={{ width: `${(d.shown / maxShown) * 100}%` }} /></div></td>
                <td>{d.email}</td><td>{d.phone}</td><td>{d.signups}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><h2>By device</h2></div>
        <table className={styles.table}>
          <thead><tr><th>Device</th><th>Saw it</th><th>Emails</th><th>Email rate</th><th>Phones</th><th>Phone rate</th></tr></thead>
          <tbody>{byDevice.map((r) => <tr key={r.k}><td>{r.k}</td><td>{r.shown}</td><td>{r.email}</td><td>{pct(r.email, r.shown)}</td><td>{r.phone}</td><td>{pct(r.phone, r.email)}</td></tr>)}</tbody>
        </table>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><h2>By page</h2><p className={styles.rowMeta}>Where the popup was when people saw it and signed up.</p></div></div>
        <table className={styles.table}>
          <thead><tr><th>Page</th><th>Saw it</th><th>Emails</th><th>Email rate</th><th>Phones</th></tr></thead>
          <tbody>{byPage.map((r) => <tr key={r.k}><td>{r.k}</td><td>{r.shown}</td><td>{r.email}</td><td>{pct(r.email, r.shown)}</td><td>{r.phone}</td></tr>)}</tbody>
        </table>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><h2>Where signups came from</h2></div>
        <table className={styles.table}>
          <thead><tr><th>Campaign or source</th><th>New customers</th></tr></thead>
          <tbody>{[...bySource.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody>
        </table>
      </section>
    </div>
  );
}
