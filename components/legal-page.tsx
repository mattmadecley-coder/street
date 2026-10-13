import Link from "next/link";
import type { ReactNode } from "react";
import { Header, Footer } from "@/components/storefront";

export const LEGAL_UPDATED = "October 9, 2026";

export type LegalTocItem = { id: string; title: string };

const muted = "rgba(16,16,16,.55)";

export function LegalPage({
  title,
  intro,
  toc,
  other,
  children,
}: {
  title: string;
  intro: ReactNode;
  toc: LegalTocItem[];
  other: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <main>
      <Header />
      <div className="shell" style={{ maxWidth: 760 }}>
        <div className="catalog-top">
          <div>
            <p className="eyebrow" style={{ color: muted }}>Legal</p>
            <h1>{title}</h1>
          </div>
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.7, color: "rgba(16,16,16,.8)", paddingBottom: 60 }}>
          <p style={{ fontSize: 12, color: muted, marginBottom: 14 }}>
            Last updated {LEGAL_UPDATED} &middot; <Link href={other.href}>{other.label}</Link>
          </p>
          <p style={{ marginBottom: 22 }}>{intro}</p>
          <nav aria-label="Contents" style={{ marginBottom: 28, padding: "14px 18px", border: "1px solid rgba(16,16,16,.12)", borderRadius: 8 }}>
            <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".06em", color: muted, marginBottom: 8 }}>Contents</p>
            <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 3 }}>
              {toc.map((t) => (
                <li key={t.id}><a href={`#${t.id}`}>{t.title}</a></li>
              ))}
            </ol>
          </nav>
          <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>{children}</div>
        </div>
      </div>
      <Footer />
    </main>
  );
}

export function LegalSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} style={{ scrollMarginTop: 80 }}>
      <h2 style={{ fontSize: 16, marginBottom: 8 }}>{title}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </section>
  );
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul style={{ listStyle: "disc", paddingLeft: 22, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
