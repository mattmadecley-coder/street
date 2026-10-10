"use client";

import { useRef, useState } from "react";
import styles from "@/app/admin/social/social.module.css";

const HOURS = ["12 AM", "1 AM", "2 AM", "3 AM", "4 AM", "5 AM", "6 AM", "7 AM", "8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM", "6 PM", "7 PM", "8 PM", "9 PM", "10 PM", "11 PM"];
const hourLabel = (h: number) => (h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`);

export type TodayLine = { key: string; label: string; color: string; today: (number | null)[] };

/** Cumulative visits through the day: today (solid, per channel) against yesterday's total pace (grey). */
export function TodayChart({ lines, yesterday, title = "Visits through the day", height = 210 }: { lines: TodayLine[]; yesterday: number[]; title?: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const W = 640, H = height, L = 36, R = 14, T = 12, B = 26;
  const pw = W - L - R, ph = H - T - B;
  const all = [...lines.flatMap((l) => l.today.filter((v): v is number => v !== null)), ...yesterday];
  const raw = Math.max(...all, 1);
  const max = raw <= 4 ? 4 : Math.ceil(raw / (raw > 20 ? 10 : 2)) * (raw > 20 ? 10 : 2);
  const x = (h: number) => L + (h / 23) * pw;
  const y = (v: number) => T + ph - (v / max) * ph;
  const lastIdx = (l: TodayLine) => { let k = -1; l.today.forEach((v, i) => { if (v !== null) k = i; }); return k; };
  const line = (vals: (number | null)[]) => vals.map((v, i) => (v === null ? null : `${x(i)},${y(v)}`)).filter(Boolean).join(" ");
  const single = lines.length === 1;

  function onMove(e: React.PointerEvent) {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(23, Math.round(((px - L) / pw) * 23))));
  }
  return (
    <div className={styles.chartCard} style={{ height: "100%" }}>
      <div className={styles.chartHead}>
        <div><h3>{title}</h3><p>Running total since midnight (Eastern) · today vs yesterday</p></div>
        <div className={styles.legend} style={{ margin: 0 }}>
          {lines.map((l) => <span key={l.key}><i style={{ background: l.color, height: 3, borderRadius: 2 }} />{l.label}</span>)}
          <span><i style={{ background: "#a9a79d", height: 3, borderRadius: 2 }} />Yesterday</span>
        </div>
      </div>
      <div ref={box} className={styles.plot} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className={styles.chartSvg} role="img" aria-label={title}>
          {[0, 0.5, 1].map((r) => (
            <g key={r}><line x1={L} x2={W - R} y1={y(max * r)} y2={y(max * r)} className={styles.gridLine} /><text x={L - 8} y={y(max * r) + 3.5} textAnchor="end" className={styles.axis}>{Math.round(max * r)}</text></g>
          ))}
          {hover !== null ? <line x1={x(hover)} x2={x(hover)} y1={T} y2={T + ph} className={styles.cross} /> : null}
          <polyline points={yesterday.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke="#a9a79d" strokeWidth="2" strokeLinejoin="round" />
          {lines.map((l) => {
            const k = lastIdx(l);
            return (
              <g key={l.key}>
                {single && k >= 0 ? <polygon points={`${x(0)},${T + ph} ${line(l.today)} ${x(k)},${T + ph}`} fill={l.color} opacity="0.1" /> : null}
                <polyline points={line(l.today)} fill="none" stroke={l.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                {k >= 0 ? <circle cx={x(k)} cy={y(l.today[k] as number)} r="4.5" fill={l.color} stroke="#fff" strokeWidth="2" /> : null}
                {hover !== null && l.today[hover] !== null ? <circle cx={x(hover)} cy={y(l.today[hover] as number)} r="4.5" fill={l.color} stroke="#fff" strokeWidth="2" /> : null}
              </g>
            );
          })}
          {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => <text key={h} x={x(h)} y={H - 8} textAnchor="middle" className={styles.axis}>{hourLabel(h)}</text>)}
        </svg>
        {hover !== null ? (
          <div className={styles.tip} style={{ left: `${(x(hover) / W) * 100}%`, transform: x(hover) > W * 0.62 ? "translateX(calc(-100% - 12px))" : "translateX(12px)" }}>
            <b>By end of {HOURS[hover]}</b>
            {lines.map((l) => (<div key={l.key}><i style={{ background: l.color }} /><strong>{l.today[hover] === null ? "-" : l.today[hover]}</strong> today{lines.length > 1 ? ` · ${l.label}` : ""}</div>))}
            <div><i style={{ background: "#a9a79d" }} /><strong>{yesterday[hover]}</strong> yesterday</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
