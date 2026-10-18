import styles from "@/app/admin/social/report/report.module.css";
import { CHANNEL_COLOR, CHANNEL_LABEL, int, type Platform } from "@/lib/social-dashboard";

type Line = { ch: Platform; values: number[] };

const W = 920, H = 260, PL = 44, PR = 12, PT = 12, PB = 28;

function niceMax(v: number) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p) * p;
}
const shortDay = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/** Server-rendered line chart over any date window (no client JS). One line per channel + a data table underneath. */
export function RangeChart({ title, days, lines }: { title: string; days: string[]; lines: Line[] }) {
  const max = niceMax(Math.max(1, ...lines.flatMap((l) => l.values)));
  const x = (i: number) => PL + (days.length <= 1 ? (W - PL - PR) / 2 : (i / (days.length - 1)) * (W - PL - PR));
  const y = (v: number) => PT + (1 - v / max) * (H - PT - PB);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  const every = Math.max(1, Math.ceil(days.length / 10));
  const empty = lines.every((l) => l.values.every((v) => v === 0));
  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHead}>
        <h3>{title}</h3>
        <div className={styles.legend}>{lines.map((l) => <span key={l.ch}><i style={{ background: CHANNEL_COLOR[l.ch] }} />{CHANNEL_LABEL[l.ch]}</span>)}</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} role="img" aria-label={`${title} by day`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} className={styles.grid} />
            <text x={PL - 8} y={y(t) + 4} textAnchor="end" className={styles.axis}>{int(t)}</text>
          </g>
        ))}
        {days.map((d, i) => (i % every === 0 || i === days.length - 1 ? <text key={d} x={x(i)} y={H - 8} textAnchor="middle" className={styles.axis}>{shortDay(d)}</text> : null))}
        {lines.map((l) => (
          <g key={l.ch}>
            <polyline fill="none" stroke={CHANNEL_COLOR[l.ch]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" points={l.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
            {days.length <= 40 ? l.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={CHANNEL_COLOR[l.ch]}><title>{`${CHANNEL_LABEL[l.ch]} ${days[i]}: ${int(v)}`}</title></circle>) : null}
          </g>
        ))}
      </svg>
      {empty ? <p className={styles.note}>Nothing recorded for this metric in the selected dates.</p> : null}
      <details className={styles.details}>
        <summary>Show numbers</summary>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Day</th>{lines.map((l) => <th key={l.ch}>{CHANNEL_LABEL[l.ch]}</th>)}<th>Total</th></tr></thead>
            <tbody>{[...days.keys()].reverse().map((i) => (
              <tr key={days[i]}><td>{days[i]}</td>{lines.map((l) => <td key={l.ch}>{int(l.values[i])}</td>)}<td><b>{int(lines.reduce((a, l) => a + l.values[i], 0))}</b></td></tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
