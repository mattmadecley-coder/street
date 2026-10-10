import Link from "next/link";
import styles from "@/app/admin/social/social.module.css";
import admin from "@/app/admin/admin.module.css";
import {
  CHANNEL_COLOR, CHANNEL_LABEL, ago, delta, fmtWhen, jobHealth, type AutomationJob, type Comparison, type GroupStat, type Platform, int, pct,
} from "@/lib/social-dashboard";

const TABS: Array<{ href: string; label: string; ch?: Platform }> = [
  { href: "/admin/social", label: "Overview" },
  { href: "/admin/social/tiktok", label: "TikTok", ch: "tiktok" },
  { href: "/admin/social/instagram", label: "Instagram", ch: "instagram" },
  { href: "/admin/social/pinterest", label: "Pinterest", ch: "pinterest" },
];

export function SocialTabs({ active }: { active: string }) {
  return (
    <nav className={styles.tabs} aria-label="Social channels">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} data-active={t.href === active ? "true" : undefined}>
          {t.ch ? <i style={{ background: CHANNEL_COLOR[t.ch] }} /> : null}{t.label}
        </Link>
      ))}
    </nav>
  );
}

export function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return <div className={styles.sectionTitle}><h2>{title}</h2>{hint ? <p>{hint}</p> : null}</div>;
}

export function Delta({ cur, prev, suffix = "" }: { cur: number; prev: number; suffix?: string }) {
  const d = delta(cur, prev);
  return <span className={styles[d.tone]}>{d.text}{suffix}</span>;
}

export function Spark({ values, color = "#101010", width = 132, height = 34 }: { values: number[]; color?: string; width?: number; height?: number }) {
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [3 + (i / Math.max(1, values.length - 1)) * (width - 8), height - 4 - (v / max) * (height - 9)]);
  const last = pts[pts.length - 1];
  return (
    <svg className={styles.spark} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Last 14 days">
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity={values.some((v) => v > 0) ? 1 : 0.35} />
      {last ? <circle cx={last[0]} cy={last[1]} r="4" fill={color} stroke="#fff" strokeWidth="2" /> : null}
    </svg>
  );
}

export function Meter({ value, max, color = "#101010" }: { value: number; max: number; color?: string }) {
  return <div className={styles.meter} style={{ ["--c" as string]: color }} role="meter" aria-valuenow={value} aria-valuemax={max}><div style={{ width: `${Math.min(100, (value / Math.max(1, max)) * 100)}%` }} /></div>;
}

export function Kpi({ label, value, cur, prev, vs, note, spark, color }: { label: string; value: string; cur?: number; prev?: number; vs?: string; note?: string; spark?: number[]; color?: string }) {
  return (
    <div className={styles.kpi}>
      <span>{label}</span>
      <strong>{value}</strong>
      {cur !== undefined && prev !== undefined ? <small><Delta cur={cur} prev={prev} /> vs {vs ?? "yesterday"} ({int(prev)})</small> : null}
      {note ? <small>{note}</small> : null}
      {spark ? <Spark values={spark} color={color} /> : null}
    </div>
  );
}

function Pill({ cur, prev }: { cur: number; prev: number }) {
  const d = delta(cur, prev);
  const cls = d.tone === "up" ? styles.pillUp : d.tone === "down" ? styles.pillDown : styles.pillFlat;
  return <span className={cls}>{d.tone === "up" ? "▲ " : d.tone === "down" ? "▼ " : ""}{d.text}</span>;
}

/** The black "today" tile: one number, compared with yesterday at the same time of day. */
export function TodayHero({ label, value, prevAtNow, yesterdayTotal, rows, nowLabel }: { label: string; value: number; prevAtNow: number; yesterdayTotal: number; rows: Array<[string, string]>; nowLabel: string }) {
  return (
    <div className={styles.hero}>
      <div className={styles.lbl}>{label}</div>
      <div className={styles.big}>{value}</div>
      <div className={styles.cmp}>
        <Pill cur={value} prev={prevAtNow} /> vs <b>{prevAtNow}</b> by {nowLabel} yesterday<br />
        Yesterday&apos;s full day: <b>{yesterdayTotal}</b>
      </div>
      <hr />
      <dl>{rows.map(([k, v]) => (<div key={k} style={{ display: "contents" }}><dt>{k}</dt><dd>{v}</dd></div>))}</dl>
    </div>
  );
}

export function ChannelCard({ ch, href, visits, prevAtNow, yesterdayTotal, spark, facts }: { ch: Platform; href: string; visits: number; prevAtNow: number; yesterdayTotal: number; spark: number[]; facts: Array<[string, string]> }) {
  return (
    <Link href={href} className={styles.chan} style={{ ["--c" as string]: CHANNEL_COLOR[ch] }}>
      <h3>{CHANNEL_LABEL[ch]} <em>open &rarr;</em></h3>
      <div className={styles.num}>{visits}</div>
      <div className={styles.sub}>visits today · <Delta cur={visits} prev={prevAtNow} /> vs {prevAtNow} at this time yesterday ({yesterdayTotal} all day)</div>
      <Spark values={spark} color={CHANNEL_COLOR[ch]} width={200} height={36} />
      <ul>{facts.map(([k, v]) => <li key={k}><span>{k}</span><b>{v}</b></li>)}</ul>
    </Link>
  );
}

/** Today / this week / this month for several metrics. */
export function CompareTable({ rows }: { rows: Array<{ label: string; c: Comparison; format?: (v: number) => string }> }) {
  return (
    <div className={styles.panel} style={{ overflowX: "auto" }}>
      <table className={admin.table}>
        <thead>
          <tr><th rowSpan={2}>Metric</th><th colSpan={3}>Today vs yesterday</th><th colSpan={3}>Last 7 days vs the 7 before</th><th colSpan={3}>Last 30 days vs the 30 before</th></tr>
          <tr><th>Today</th><th>Yest.</th><th>Change</th><th>7d</th><th>Prev</th><th>Change</th><th>30d</th><th>Prev</th><th>Change</th></tr>
        </thead>
        <tbody>{rows.map((r) => {
          const f = r.format ?? int; const c = r.c;
          return (
            <tr key={r.label}>
              <td><b>{r.label}</b></td>
              <td>{f(c.today)}</td><td>{f(c.yesterday)}</td><td><Delta cur={c.today} prev={c.yesterday} /></td>
              <td>{f(c.last7)}</td><td>{f(c.prev7)}</td><td><Delta cur={c.last7} prev={c.prev7} /></td>
              <td>{f(c.last30)}</td><td>{f(c.prev30)}</td><td><Delta cur={c.last30} prev={c.prev30} /></td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

const JOB_NAMES: Record<string, string> = {
  tiktok_post: "TikTok auto-poster", tiktok_stats: "TikTok stats collector", pinterest_run: "Pinterest scheduler",
  ig_carousel: "Instagram carousel poster", ig_follow_bot: "Instagram follow bot", dashboard_sync: "Dashboard sync (PC to site)",
};

export function HealthList({ jobs }: { jobs: AutomationJob[] }) {
  if (!jobs.length) return <div className={styles.empty}>No automation has reported in yet. The PC sync runs hourly, so this fills in after its first run.</div>;
  return (
    <div className={styles.health}>
      {jobs.map((j) => {
        const h = jobHealth(j);
        return (
          <div key={j.job} className={styles.healthRow}>
            <span className={styles.dot} data-level={h.level} />
            <div>{JOB_NAMES[j.job] ?? j.job}
              <small>{h.label}{j.last_message && h.level !== "ok" ? `: ${j.last_message}` : ""}</small>
              <small>Last run {ago(j.last_run_at)} · checked {ago(j.updated_at)}</small>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Alerts({ items }: { items: Array<{ level: "bad" | "warn" | "info"; text: string }> }) {
  if (!items.length) return <div className={styles.alerts}><div className={styles.alert} data-level="ok"><b>All clear.</b>Every bot is reporting and nothing needs attention.</div></div>;
  return (
    <div className={styles.alerts}>
      {items.map((a, i) => (
        <div key={i} className={styles.alert} data-level={a.level === "bad" ? undefined : a.level}><b>{a.level === "bad" ? "Fix needed" : a.level === "warn" ? "Heads up" : "Note"}</b>{a.text}</div>
      ))}
    </div>
  );
}

export function GroupTable({ title, rows, empty = "Not enough data yet." }: { title: string; rows: GroupStat[]; empty?: string }) {
  return (
    <div>
      <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>{title}</h3>
      {rows.length ? (
        <div className={styles.panel}>
          <table className={admin.table}>
            <thead><tr><th>Name</th><th>Posts</th><th>Avg views</th><th>Likes</th><th>Eng. rate</th></tr></thead>
            <tbody>{rows.slice(0, 12).map((r) => (
              <tr key={r.key}><td><div className={styles.thumb} title={r.key}>{r.key}</div></td><td>{r.posts}</td><td><b>{int(r.avgViews)}</b></td><td>{int(r.likes)}</td><td>{pct(r.engagement)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      ) : <div className={styles.empty}>{empty}</div>}
    </div>
  );
}

export { fmtWhen };
