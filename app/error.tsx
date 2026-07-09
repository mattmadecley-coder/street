"use client";

import { useEffect } from "react";
import Link from "next/link";

// Root error boundary — catches anything thrown while rendering a page.
// Deliberately plain (no async Header — client components can't await
// Server Component data) but still on-brand instead of Next's default
// crash screen.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Street: unhandled page error", error);
  }, [error]);

  return (
    <main>
      <div className="shell" style={{ display: "grid", placeItems: "center", minHeight: "70vh", textAlign: "center", gap: 14 }}>
        <div>
          <p style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-.12em", marginBottom: 16 }}>STREET</p>
          <h1 style={{ fontSize: 26, letterSpacing: "-.03em", margin: "0 0 10px" }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: "rgba(16,16,16,.65)", margin: "0 0 20px" }}>That&rsquo;s on us, not you. Try again, or head back to the catalog.</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button type="button" onClick={reset} style={{ height: 42, padding: "0 22px", border: 0, background: "#101010", color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer" }}>Try again</button>
            <Link href="/" style={{ display: "inline-flex", alignItems: "center", height: 42, padding: "0 22px", border: "1px solid rgba(16,16,16,.3)", color: "#101010", fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", textDecoration: "none" }}>Go home</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
