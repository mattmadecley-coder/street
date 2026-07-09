"use client";

import { useEffect } from "react";

// Catches errors thrown by the root layout itself (rare — app/error.tsx
// can't catch those since it renders inside the layout). Has to render its
// own <html>/<body> since the real layout is what failed.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Street: unhandled root layout error", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "Arial, Helvetica, sans-serif", background: "#f4f3ee", color: "#101010" }}>
        <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", textAlign: "center", padding: 20 }}>
          <div>
            <p style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-.12em", marginBottom: 16 }}>STREET</p>
            <h1 style={{ fontSize: 22, margin: "0 0 10px" }}>Something went wrong</h1>
            <p style={{ fontSize: 14, opacity: 0.65, margin: "0 0 20px" }}>Please try again in a moment.</p>
            <button type="button" onClick={reset} style={{ height: 42, padding: "0 22px", border: 0, background: "#101010", color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer" }}>Try again</button>
          </div>
        </div>
      </body>
    </html>
  );
}
