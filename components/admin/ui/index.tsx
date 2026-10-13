import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ChangeChip } from "@/components/admin/change-chip";
import { InfoTip } from "@/components/admin/info-tip";
import type { ChangeTone } from "@/lib/analytics-change";
import type { MetricKey } from "@/lib/analytics-glossary";

/** Page title block: optional breadcrumbs, title, subtitle and right-aligned actions. */
export function PageHeader({
  title,
  subtitle,
  crumbs,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  crumbs?: Array<{ label: string; href?: string }>;
  actions?: ReactNode;
}) {
  return (
    <div className="adm-page-head">
      <div>
        {crumbs?.length ? (
          <nav aria-label="Breadcrumb">
            <ol className="adm-crumbs">
              {crumbs.map((crumb) => (
                <li key={crumb.label}>{crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : <span aria-current="page">{crumb.label}</span>}</li>
              ))}
            </ol>
          </nav>
        ) : null}
        <h1 className="adm-page-title">{title}</h1>
        {subtitle ? <p className="adm-page-sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="adm-page-actions">{actions}</div> : null}
    </div>
  );
}

/** A tiny trend line for a stat tile. Values are plotted left to right; needs at least 2 points. */
export function Sparkline({ values, label }: { values: number[]; label?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const width = 100;
  const height = 28;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - 3 - ((value - min) / span) * (height - 6);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return (
    <svg className="adm-spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label ?? "Trend"}>
      <polyline points={points.join(" ")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Headline number with label, optional change chip, tooltip definition and sparkline. Renders as a link when `href` is set. */
export function StatTile({
  label,
  value,
  metric,
  change,
  note,
  href,
  spark,
}: {
  label: string;
  value: ReactNode;
  metric?: MetricKey;
  change?: { text: string; tone: ChangeTone };
  note?: ReactNode;
  href?: string;
  spark?: number[];
}) {
  const body = (
    <>
      <span className="adm-tile-label">{label}{metric ? <InfoTip metric={metric} /> : null}</span>
      <span className="adm-tile-value">{value}</span>
      {spark ? <Sparkline values={spark} label={`${label} trend`} /> : null}
      {change || note ? (
        <span className="adm-tile-foot">
          {change ? <ChangeChip text={change.text} tone={change.tone} /> : null}
          {note ? <span>{note}</span> : null}
        </span>
      ) : null}
    </>
  );
  return href ? <Link href={href} className="adm-tile">{body}</Link> : <div className="adm-tile">{body}</div>;
}

export function Badge({ tone, children }: { tone?: "success" | "warn" | "danger" | "info"; children: ReactNode }) {
  return <span className="adm-badge" data-tone={tone}>{children}</span>;
}

export function Banner({ tone = "info", children }: { tone?: "info" | "success" | "warn" | "danger"; children: ReactNode }) {
  return (
    <div className="adm-banner" data-tone={tone} role={tone === "danger" ? "alert" : "status"}>
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="adm-empty">
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

export function Skeleton({ width, height = 16 }: { width?: number | string; height?: number | string }) {
  return <div className="adm-skel" style={{ "--sk-w": typeof width === "number" ? `${width}px` : width ?? "100%", "--sk-h": typeof height === "number" ? `${height}px` : height } as CSSProperties} aria-hidden="true" />;
}

export function LinkButton({ href, children, variant, size }: { href: string; children: ReactNode; variant?: "secondary" | "ghost" | "danger-outline"; size?: "sm" }) {
  return <Link href={href} className="adm-btn" data-variant={variant} data-size={size}>{children}</Link>;
}

/** Sub-navigation as tabs (links). `active` is matched against each href. */
export function Tabs({ tabs, active, label }: { tabs: Array<{ href: string; label: string; badge?: number }>; active: string; label: string }) {
  return (
    <nav className="adm-tabs" aria-label={label}>
      {tabs.map((tab) => (
        <Link key={tab.href} href={tab.href} className="adm-tab" aria-current={tab.href === active ? "page" : undefined}>
          {tab.label}
          {tab.badge ? <span className="adm-badge" data-tone="danger">{tab.badge}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
