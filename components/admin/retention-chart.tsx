"use client";

import { useState } from "react";
import styles from "@/app/admin/admin.module.css";

export type RetentionPoint = { key: string; label: string; newVisitors: number; returningVisitors: number };

const NEW_COLOR = "#2a78d6";
const BACK_COLOR = "#1baf7a";

export function RetentionChart({ points, unit }: { points: RetentionPoint[]; unit: "hour" | "day" }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const width = 820;
  const height = 280;
  const left = 44;
  const right = 18;
  const top = 18;
  const bottom = 40;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maximum = Math.max(3, ...points.map((point) => Math.max(point.newVisitors, point.returningVisitors)));
  const x = (index: number) => left + (points.length <= 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const y = (value: number) => top + plotHeight - (value / maximum) * plotHeight;
  const path = (key: "newVisitors" | "returningVisitors") => points.map((point, index) => `${index ? "L" : "M"} ${x(index).toFixed(1)} ${y(point[key]).toFixed(1)}`).join(" ");
  const labelEvery = Math.max(1, Math.ceil(points.length / 8));
  const active = hovered === null ? null : points[hovered];
  const unitLabel = unit === "hour" ? "hour" : "day";

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", gap: 18, fontSize: 13, marginBottom: 6, flexWrap: "wrap" }}>
        <span><span style={{ display: "inline-block", width: 12, height: 3, background: NEW_COLOR, marginRight: 6, verticalAlign: "middle" }} />First-time visitors</span>
        <span><span style={{ display: "inline-block", width: 12, height: 3, background: BACK_COLOR, marginRight: 6, verticalAlign: "middle" }} />Returning visitors</span>
        <span style={{ opacity: 0.6 }}>per {unitLabel}</span>
      </div>
      <div className={styles.analyticsChartWrap}>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`First-time and returning visitors per ${unitLabel}`}>
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const gy = top + plotHeight - plotHeight * ratio;
            return (
              <g key={ratio}>
                <line x1={left} x2={width - right} y1={gy} y2={gy} className={styles.analyticsGridLine} />
                <text x={left - 10} y={gy + 4} textAnchor="end" className={styles.analyticsAxisLabel}>{Math.round(maximum * ratio)}</text>
              </g>
            );
          })}
          <path d={path("newVisitors")} fill="none" stroke={NEW_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <path d={path("returningVisitors")} fill="none" stroke={BACK_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {points.map((point, index) => {
            const hit = Math.max(8, plotWidth / Math.max(1, points.length));
            return (
              <g key={point.key}>
                {index % labelEvery === 0 || index === points.length - 1 ? (
                  <text x={x(index)} y={height - 14} textAnchor="middle" className={styles.analyticsAxisLabel}>{point.label}</text>
                ) : null}
                <rect
                  x={x(index) - hit / 2} y={top} width={hit} height={plotHeight} fill="transparent" tabIndex={0}
                  onMouseEnter={() => setHovered(index)} onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(index)} onBlur={() => setHovered(null)}
                  aria-label={`${point.label}: ${point.newVisitors} first-time, ${point.returningVisitors} returning`}
                />
              </g>
            );
          })}
          {active && hovered !== null ? (
            <g pointerEvents="none">
              <line x1={x(hovered)} x2={x(hovered)} y1={top} y2={top + plotHeight} className={styles.analyticsHoverLine} />
              <circle cx={x(hovered)} cy={y(active.newVisitors)} r={5} fill={NEW_COLOR} stroke="#fff" strokeWidth={2} />
              <circle cx={x(hovered)} cy={y(active.returningVisitors)} r={5} fill={BACK_COLOR} stroke="#fff" strokeWidth={2} />
              <g transform={`translate(${Math.min(width - 190, Math.max(50, x(hovered) - 85))}, ${top})`}>
                <rect width={170} height={68} rx={8} className={styles.analyticsTooltipBox} />
                <text x={12} y={18} className={styles.analyticsTooltipLabel}>{active.label}</text>
                <text x={12} y={38} className={styles.analyticsTooltipValue}>{active.newVisitors} first-time</text>
                <text x={12} y={58} className={styles.analyticsTooltipValue}>{active.returningVisitors} returning</text>
              </g>
            </g>
          ) : null}
        </svg>
      </div>
      <details style={{ marginTop: 6 }}>
        <summary style={{ cursor: "pointer", fontSize: 13 }}>Show as table</summary>
        <table className={styles.table}>
          <thead><tr><th>{unit === "hour" ? "Hour" : "Day"}</th><th>First-time</th><th>Returning</th></tr></thead>
          <tbody>{[...points].reverse().map((point) => <tr key={point.key}><td>{point.label}</td><td>{point.newVisitors}</td><td>{point.returningVisitors}</td></tr>)}</tbody>
        </table>
      </details>
    </div>
  );
}
