"use client";

import { useMemo, useState } from "react";
import styles from "@/app/admin/admin.module.css";
import type { AnalyticsTrendPoint } from "@/lib/analytics-audience";

type MetricKey = "visitors" | "outboundClicks" | "intentValue";

type MetricDefinition = {
  key: MetricKey;
  label: string;
  value: (point: AnalyticsTrendPoint) => number;
  format: (value: number) => string;
};

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const METRICS: MetricDefinition[] = [
  { key: "visitors", label: "Likely visitors", value: (point) => point.visitors, format: (value) => integer.format(value) },
  { key: "outboundClicks", label: "Outbound clicks", value: (point) => point.outboundClicks, format: (value) => integer.format(value) },
  { key: "intentValue", label: "Intent value", value: (point) => point.intentValue, format: (value) => currency.format(value) },
];

function smoothPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const before = points[index - 1] ?? current;
    const after = points[index + 2] ?? next;
    const control1X = current.x + (next.x - before.x) / 6;
    const control1Y = current.y + (next.y - before.y) / 6;
    const control2X = next.x - (after.x - current.x) / 6;
    const control2Y = next.y - (after.y - current.y) / 6;
    path += ` C ${control1X} ${control1Y}, ${control2X} ${control2Y}, ${next.x} ${next.y}`;
  }
  return path;
}

export function AnalyticsOverviewChart({ points }: { points: AnalyticsTrendPoint[] }) {
  const [metricKey, setMetricKey] = useState<MetricKey>("visitors");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const metric = METRICS.find((entry) => entry.key === metricKey) ?? METRICS[0];

  const chart = useMemo(() => {
    const width = 820;
    const height = 300;
    const left = 48;
    const right = 18;
    const top = 22;
    const bottom = 44;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const values = points.map(metric.value);
    const maximum = Math.max(1, ...values);
    const coordinates = values.map((value, index) => ({
      x: left + (points.length <= 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth),
      y: top + plotHeight - (value / maximum) * plotHeight,
      value,
    }));
    const line = smoothPath(coordinates);
    const area = coordinates.length
      ? `${line} L ${coordinates[coordinates.length - 1].x} ${top + plotHeight} L ${coordinates[0].x} ${top + plotHeight} Z`
      : "";
    return { width, height, left, right, top, bottom, plotWidth, plotHeight, maximum, coordinates, line, area };
  }, [metric, points]);

  const labelEvery = Math.max(1, Math.ceil(points.length / 7));
  const hovered = hoveredIndex === null ? null : points[hoveredIndex];
  const hoveredCoordinate = hoveredIndex === null ? null : chart.coordinates[hoveredIndex];

  return (
    <section className={styles.analyticsChartCard}>
      <div className={styles.analyticsChartHead}>
        <div>
          <p className={styles.analyticsEyebrow}>Store performance</p>
          <h2>Traffic and purchase intent over time</h2>
          <p>Switch between qualified visitors, outbound clicks, and the listed value attached to product-intent clicks.</p>
        </div>
        <div className={styles.analyticsMetricTabs} aria-label="Chart metric">
          {METRICS.map((entry) => (
            <button
              type="button"
              key={entry.key}
              data-active={entry.key === metricKey}
              onClick={() => setMetricKey(entry.key)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.analyticsChartWrap}>
        <svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label={`${metric.label} over time`}>
          <defs>
            <linearGradient id="streetAnalyticsArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = chart.top + chart.plotHeight - chart.plotHeight * ratio;
            const value = chart.maximum * ratio;
            return (
              <g key={ratio}>
                <line x1={chart.left} x2={chart.width - chart.right} y1={y} y2={y} className={styles.analyticsGridLine} />
                <text x={chart.left - 10} y={y + 4} textAnchor="end" className={styles.analyticsAxisLabel}>{metric.format(value)}</text>
              </g>
            );
          })}

          {chart.area ? <path d={chart.area} className={styles.analyticsAreaPath} fill="url(#streetAnalyticsArea)" /> : null}
          {chart.line ? <path d={chart.line} className={styles.analyticsLinePath} /> : null}

          {points.map((point, index) => {
            const coordinate = chart.coordinates[index];
            if (!coordinate) return null;
            const hitWidth = Math.max(8, chart.plotWidth / Math.max(1, points.length));
            return (
              <g key={point.key}>
                {(index % labelEvery === 0 || index === points.length - 1) ? (
                  <text x={coordinate.x} y={chart.height - 14} textAnchor="middle" className={styles.analyticsAxisLabel}>{point.label}</text>
                ) : null}
                <rect
                  x={coordinate.x - hitWidth / 2}
                  y={chart.top}
                  width={hitWidth}
                  height={chart.plotHeight}
                  fill="transparent"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onFocus={() => setHoveredIndex(index)}
                  onBlur={() => setHoveredIndex(null)}
                  tabIndex={0}
                  aria-label={`${point.label}: ${metric.format(coordinate.value)} ${metric.label.toLowerCase()}`}
                />
              </g>
            );
          })}

          {hovered && hoveredCoordinate ? (
            <g pointerEvents="none">
              <line x1={hoveredCoordinate.x} x2={hoveredCoordinate.x} y1={chart.top} y2={chart.top + chart.plotHeight} className={styles.analyticsHoverLine} />
              <circle cx={hoveredCoordinate.x} cy={hoveredCoordinate.y} r="5" className={styles.analyticsPoint} />
              <g transform={`translate(${Math.min(chart.width - 170, Math.max(55, hoveredCoordinate.x - 75))}, ${Math.max(8, hoveredCoordinate.y - 62)})`}>
                <rect width="150" height="48" rx="8" className={styles.analyticsTooltipBox} />
                <text x="12" y="18" className={styles.analyticsTooltipLabel}>{hovered.label}</text>
                <text x="12" y="37" className={styles.analyticsTooltipValue}>{metric.format(metric.value(hovered))}</text>
              </g>
            </g>
          ) : null}
        </svg>
      </div>
    </section>
  );
}
