"use client";

import { useRef, useState } from "react";
import styles from "@/app/admin/social/social.module.css";
import type { Series } from "@/lib/social-dashboard";

type Gran = "day" | "week" | "month";
type Layout = "stack" | "lines" | "tabs";
const RANGE: Record<Gran, string> = { day: "Last 30 days", week: "Last 12 weeks", month: "Last 12 months" };
const MUTED = "#c9c7bf";
const fmt = (v: number, f?: "int" | "pct") => (f === "pct" ? `${(v * 100).toFixed(1)}%` : v >= 10000 ? `${(v / 1000).toFixed(1)}K` : Math.round(v).toLocaleString("en-US"));

function niceMax(v: number) {
  if (v <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}
/** column with a 4px rounded top and a square base */
function colPath(x: number, y: number, w: number, h: number, r: number, round: boolean) {
  const rr = round ? Math.min(r, w / 2, h) : 0;
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

/**
 * layout "stack"  - one stacked column per period, series are channels (same unit), legend + shared tooltip
 * layout "lines"  - one line per series on a shared axis
 * layout "tabs"   - series are different metrics; one at a time as columns, latest period emphasised
 */
export function SocialChart({ title, subtitle, series, layout = "tabs", height = 240 }: { title: string; subtitle?: string; series: Series[]; layout?: Layout; height?: number }) {
  const [key, setKey] = useState(series[0]?.key);
  const [gran, setGran] = useState<Gran>("day");
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const shown = layout === "tabs" ? series.filter((s) => s.key === (key ?? series[0]?.key)) : series;
  if (!series.length || !shown.length) return null;
  const count = shown[0][gran].length;
  const W = 760, H = height, L = 40, R = 12, T = 14, B = 28;
  const pw = W - L - R, ph = H - T - B;
  const step = pw / count;
  const totals = Array.from({ length: count }, (_, i) => (layout === "stack" ? shown.reduce((a, s) => a + s[gran][i].y, 0) : Math.max(...shown.map((s) => s[gran][i].y))));
  const max = niceMax(Math.max(...totals, 1e-9));
  const y = (v: number) => T + ph - (v / max) * ph;
  const cx = (i: number) => L + step * i + step / 2;
  const barW = Math.min(24, step * 0.7);
  const every = Math.ceil(count / 7);
  const pct = shown[0].format === "pct";
  const tipLeft = hover === null ? 0 : (cx(hover) / W) * 100;
  const tipFlip = hover !== null && cx(hover) > W * 0.62;

  function onMove(e: React.PointerEvent) {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(count - 1, Math.floor((px - L) / step))));
  }

  const legend = series.length > 1 && layout !== "tabs";
  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHead}>
        <div>
          <h3>{title}</h3>
          <p>{subtitle ? `${subtitle} · ` : ""}{RANGE[gran]}</p>
        </div>
        <div className={styles.pills}>
          {layout === "tabs" && series.length > 1 && series.map((s) => (
            <button type="button" key={s.key} data-active={s.key === shown[0].key} onClick={() => setKey(s.key)}>{s.label}</button>
          ))}
          {layout === "tabs" && series.length > 1 ? <span className={styles.sep} /> : null}
          {(["day", "week", "month"] as Gran[]).map((g) => (
            <button type="button" key={g} data-active={g === gran} onClick={() => setGran(g)}>{g === "day" ? "30 days" : g === "week" ? "12 weeks" : "12 months"}</button>
          ))}
          <span className={styles.sep} />
          <button type="button" data-active={table} onClick={() => setTable(!table)}>Table</button>
        </div>
      </div>
      {legend ? (
        <div className={styles.legend}>
          {series.map((s) => (<span key={s.key}><i style={{ background: s.color ?? "#101010", ...(layout === "lines" ? { height: 3, borderRadius: 2 } : {}) }} />{s.label}</span>))}
        </div>
      ) : null}

      {table ? (
        <div className={styles.tableWrap}>
          <table className={styles.dataTable}>
            <thead><tr><th>Period</th>{series.map((s) => <th key={s.key}>{s.label}</th>)}</tr></thead>
            <tbody>{[...shown[0][gran]].map((p, i) => ({ p, i })).reverse().map(({ p, i }) => (
              <tr key={i}><td>{p.x}</td>{series.map((s) => <td key={s.key}>{fmt(s[gran][i].y, s.format)}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div ref={box} className={styles.plot} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} className={styles.chartSvg} role="img" aria-label={`${title}, ${RANGE[gran]}`}>
            {[0, 0.5, 1].map((r) => (
              <g key={r}>
                <line x1={L} x2={W - R} y1={y(max * r)} y2={y(max * r)} className={styles.gridLine} />
                <text x={L - 8} y={y(max * r) + 3.5} textAnchor="end" className={styles.axis}>{fmt(max * r, pct ? "pct" : "int")}</text>
              </g>
            ))}
            {hover !== null && layout === "lines" ? <line x1={cx(hover)} x2={cx(hover)} y1={T} y2={T + ph} className={styles.cross} /> : null}

            {layout === "lines" ? shown.map((s) => {
              const pts = s[gran].map((p, i) => `${cx(i)},${y(p.y)}`).join(" ");
              const last = s[gran][count - 1];
              return (
                <g key={s.key}>
                  {shown.length === 1 ? <polygon points={`${cx(0)},${T + ph} ${pts} ${cx(count - 1)},${T + ph}`} fill={s.color ?? "#101010"} opacity="0.1" /> : null}
                  <polyline points={pts} fill="none" stroke={s.color ?? "#101010"} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                  <circle cx={cx(count - 1)} cy={y(last.y)} r="4.5" fill={s.color ?? "#101010"} stroke="#fff" strokeWidth="2" />
                  {hover !== null ? <circle cx={cx(hover)} cy={y(s[gran][hover].y)} r="4.5" fill={s.color ?? "#101010"} stroke="#fff" strokeWidth="2" /> : null}
                </g>
              );
            }) : null}

            {layout === "stack" ? Array.from({ length: count }, (_, i) => {
              let acc = 0;
              const parts = shown.map((s) => ({ s, v: s[gran][i].y })).filter((q) => q.v > 0);
              return (
                <g key={i} opacity={hover === null || hover === i ? 1 : 0.55}>
                  {parts.map((q, k) => {
                    const top = y(acc + q.v), bottom = y(acc);
                    acc += q.v;
                    const gap = k === 0 ? 0 : 2;
                    return <path key={q.s.key} d={colPath(cx(i) - barW / 2, top, barW, Math.max(1, bottom - top - gap), 4, k === parts.length - 1)} fill={q.s.color ?? "#101010"} />;
                  })}
                  {!parts.length ? <rect x={cx(i) - barW / 2} y={T + ph - 1.5} width={barW} height="1.5" fill={MUTED} /> : null}
                </g>
              );
            }) : null}

            {layout === "tabs" ? shown[0][gran].map((p, i) => {
              const h = Math.max(p.y > 0 ? 2 : 1.5, T + ph - y(p.y));
              const latest = i === count - 1;
              return <path key={i} d={colPath(cx(i) - barW / 2, T + ph - h, barW, h, 4, true)} fill={latest ? shown[0].color ?? "#101010" : hover === i ? "#9b998f" : MUTED} />;
            }) : null}

            {shown[0][gran].map((p, i) => (i === count - 1 || (i % every === 0 && count - 1 - i >= Math.ceil(every / 2))) ? (
              <text key={i} x={cx(i)} y={H - 8} textAnchor="middle" className={styles.axis}>{p.x}</text>
            ) : null)}
          </svg>
          {hover !== null ? (
            <div className={styles.tip} style={{ left: `${tipLeft}%`, transform: tipFlip ? "translateX(calc(-100% - 12px))" : "translateX(12px)" }}>
              <b>{shown[0][gran][hover].x}</b>
              {shown.map((s) => (<div key={s.key}><i style={{ background: s.color ?? "#101010" }} /><strong>{fmt(s[gran][hover].y, s.format)}</strong> {s.label}</div>))}
              {layout === "stack" && shown.length > 1 ? <div className={styles.tipTotal}>Total <strong>{fmt(totals[hover])}</strong></div> : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
