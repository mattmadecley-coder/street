"use client";

import { useState } from "react";
import styles from "@/app/admin/social/social.module.css";
import type { Series } from "@/lib/social-dashboard";

type Gran = "day" | "week" | "month";
const LABEL: Record<Gran, string> = { day: "Day over day", week: "Week over week", month: "Month over month" };
const fmt = (v: number, f?: "int" | "pct") => (f === "pct" ? `${(v * 100).toFixed(1)}%` : Math.round(v).toLocaleString("en-US"));

export function SocialChart({ title, subtitle, series, line = false }: { title: string; subtitle?: string; series: Series[]; line?: boolean }) {
  const [key, setKey] = useState(series[0]?.key);
  const [gran, setGran] = useState<Gran>("day");
  const s = series.find((x) => x.key === key) ?? series[0];
  if (!s) return null;
  const pts = s[gran];
  const W = 760, H = 220, L = 44, R = 10, T = 12, B = 30;
  const pw = W - L - R, ph = H - T - B;
  const max = Math.max(1e-9, ...pts.map((p) => p.y));
  const step = pw / pts.length;
  const every = Math.ceil(pts.length / 8);
  const xy = pts.map((p, i) => ({ x: L + step * i + step / 2, y: T + ph - (p.y / max) * ph, p }));
  const total = pts.reduce((a, p) => a + p.y, 0);
  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHead}>
        <div>
          <h3>{title}</h3>
          <p>{subtitle ? `${subtitle} · ` : ""}{LABEL[gran]}{s.format === "pct" ? "" : ` · ${fmt(total, s.format)} in view`}</p>
        </div>
        <div className={styles.pills}>
          {series.length > 1 && series.map((x) => (
            <button type="button" key={x.key} data-active={x.key === s.key} onClick={() => setKey(x.key)}>{x.label}</button>
          ))}
          <span style={{ width: 8 }} />
          {(["day", "week", "month"] as Gran[]).map((g) => (
            <button type="button" key={g} data-active={g === gran} onClick={() => setGran(g)}>{g === "day" ? "30d" : g === "week" ? "12w" : "12m"}</button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.chartSvg} role="img" aria-label={`${s.label} ${LABEL[gran]}`}>
        {[0, 0.5, 1].map((r) => (
          <g key={r}>
            <line x1={L} x2={W - R} y1={T + ph - ph * r} y2={T + ph - ph * r} className={styles.gridLine} />
            <text x={L - 6} y={T + ph - ph * r + 3} textAnchor="end" className={styles.axis}>{fmt(max * r, s.format)}</text>
          </g>
        ))}
        {line ? (
          <polyline className={styles.lineP} points={xy.map((c) => `${c.x},${c.y}`).join(" ")} />
        ) : (
          xy.map((c, i) => (
            <rect key={i} x={c.x - step * 0.36} y={c.y} width={step * 0.72} height={Math.max(1, T + ph - c.y)} className={styles.bar}>
              <title>{`${c.p.x}: ${fmt(c.p.y, s.format)}`}</title>
            </rect>
          ))
        )}
        {line && xy.map((c, i) => <circle key={i} cx={c.x} cy={c.y} r="3" fill="#101010"><title>{`${c.p.x}: ${fmt(c.p.y, s.format)}`}</title></circle>)}
        {xy.map((c, i) => (i === xy.length - 1 || (i % every === 0 && xy.length - 1 - i >= Math.ceil(every / 2))) ? <text key={i} x={c.x} y={H - 10} textAnchor="middle" className={styles.axis}>{c.p.x}</text> : null)}
      </svg>
    </div>
  );
}
