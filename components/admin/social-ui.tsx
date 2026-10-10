import Link from "next/link";
import styles from "@/app/admin/social/social.module.css";
import admin from "@/app/admin/admin.module.css";
import { ago, delta, fmtWhen, jobHealth, type AutomationJob, type Comparison, type GroupStat, int, pct } from "@/lib/social-dashboard";

const TABS = [
  { href: "/admin/social", label: "Overview" },
  { href: "/admin/social/tiktok", label: "TikTok" },
  { href: "/admin/social/instagram", label: "Instagram" },
  { href: "/admin/social/pinterest", label: "Pinterest" },
];

export function SocialTabs({ active }: { active: string }) {
  return (
    <nav className={styles.tabs} aria-label="Social channels">
      {TABS.map((t) => <Link key={t.href} href={t.href} data-active={t.href === active ? "true" : undefined}>{t.label}</Link>)}
    </nav>
  );
}

export function Delta({ cur, prev, suffix = "" }: { cur: number; prev: number; suffix?: string }) {
  const d = delta(cur, prev);
  return <span className={styles[d.tone]}>{d.text}{suffix}</span>;
}

export function Kpi({ label, value, cur, prev, vs, note }: { label: string; value: string; cur?: number; prev?: number; vs?: string; note?: string }) {
  return (
    <div className={styles.kpi}>
      <span>{label}</span>
      <strong>{value}</strong>
      {cur !== undefined && prev !== undefined ? <small><Delta cur={cur} prev={prev} /> vs {vs ?? "yesterday"} ({int(prev)})</small> : null}
      {note ? <small>{note}</small> : null}
    </div>
  );
}

/** Today vs yesterday, week vs prior week, month vs prior month for one metric. */
export function CompareRow({ label, c, format = int }: { label: string; c: Comparison; format?: (v: number) => string }) {
  return (
    <tr>
      <td>{label}</td>
      <td>{format(c.today)}</td><td>{format(c.yesterday)}</td><td><Delta cur={c.today} prev={c.yesterday} /></td>
      <td>{format(c.last7)}</td><td>{format(c.prev7)}</td><td><Delta cur={c.last7} prev={c.prev7} /></td>
      <td>{format(c.last30)}</td><td>{format(c.prev30)}</td><td><Delta cur={c.last30} prev={c.prev30} /></td>
    </tr>
  );
}

export function CompareTable({ rows }: { rows: Array<{ label: string; c: Comparison; format?: (v: number) => string }> }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className={admin.table}>
        <thead>
          <tr><th rowSpan={2}>Metric</th><th colSpan={3}>Today vs yesterday</th><th colSpan={3}>Last 7d vs previous 7d</th><th colSpan={3}>Last 30d vs previous 30d</th></tr>
          <tr><th>Today</th><th>Yest.</th><th>Change</th><th>7d</th><th>Prev</th><th>Change</th><th>30d</th><th>Prev</th><th>Change</th></tr>
        </thead>
        <tbody>{rows.map((r) => <CompareRow key={r.label} label={r.label} c={r.c} format={r.format} />)}</tbody>
      </table>
    </div>
  );
}

export function HealthList({ jobs }: { jobs: AutomationJob[] }) {
  const NAMES: Record<string, string> = {
    tiktok_post: "TikTok auto-poster (6 posts/day)", tiktok_stats: "TikTok stats collector", pinterest_run: "Pinterest scheduler (10 pins/day)",
    ig_carousel: "Instagram carousel poster", ig_follow_bot: "Instagram follow bot", dashboard_sync: "Dashboard data sync (PC to site)",
  };
  if (!jobs.length) return <div className={styles.empty}>No automation has reported in yet. The PC sync runs hourly - this fills in after its first run.</div>;
  return (
    <div className={styles.health}>
      {jobs.map((j) => {
        const h = jobHealth(j);
        return (
          <div key={j.job} className={styles.healthRow}>
            <span className={styles.dot} data-level={h.level} />
            <div>{NAMES[j.job] ?? j.job}<small>{h.label}{j.last_message ? ` - ${j.last_message}` : ""}</small></div>
            <div className={styles.when}>last run {ago(j.last_run_at)}<br />synced {ago(j.updated_at)}</div>
          </div>
        );
      })}
    </div>
  );
}

export function Alerts({ items }: { items: Array<{ level: "bad" | "warn" | "info"; text: string }> }) {
  if (!items.length) return <div style={{ margin: "0 0 20px" }}><div className={styles.alert} data-level="info" style={{ borderColor: "#b7dcae", background: "#eef7ec" }}>All clear - nothing needs attention.</div></div>;
  return <div style={{ margin: "0 0 20px" }}>{items.map((a, i) => <div key={i} className={styles.alert} data-level={a.level === "bad" ? undefined : a.level}>{a.text}</div>)}</div>;
}

export function GroupTable({ title, rows, empty = "Not enough data yet." }: { title: string; rows: GroupStat[]; empty?: string }) {
  return (
    <div>
      <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>{title}</h3>
      {rows.length ? (
        <table className={admin.table}>
          <thead><tr><th>Name</th><th>Posts</th><th>Avg views</th><th>Likes</th><th>Eng. rate</th></tr></thead>
          <tbody>{rows.slice(0, 12).map((r) => (
            <tr key={r.key}><td><div className={styles.thumb} title={r.key}>{r.key}</div></td><td>{r.posts}</td><td>{int(r.avgViews)}</td><td>{int(r.likes)}</td><td>{pct(r.engagement)}</td></tr>
          ))}</tbody>
        </table>
      ) : <div className={styles.empty}>{empty}</div>}
    </div>
  );
}

export { fmtWhen };
