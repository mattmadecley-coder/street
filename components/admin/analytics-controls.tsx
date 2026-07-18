"use client";

import { useEffect, useState } from "react";

const DISABLED_KEY = "street-analytics-disabled";

export function AnalyticsControls({ days }: { days: number }) {
  const [excluded, setExcluded] = useState(false);

  useEffect(() => {
    setExcluded(localStorage.getItem(DISABLED_KEY) === "true");
  }, []);

  function toggleExclusion() {
    const next = !excluded;
    setExcluded(next);
    if (next) localStorage.setItem(DISABLED_KEY, "true");
    else localStorage.removeItem(DISABLED_KEY);
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <button type="button" onClick={toggleExclusion} style={{ height: 34, padding: "0 12px", border: "1px solid rgba(16,16,16,.25)", background: excluded ? "#101010" : "#fff", color: excluded ? "#fff" : "#101010", cursor: "pointer" }}>
        {excluded ? "This browser is excluded" : "Exclude this browser"}
      </button>
      <a href={`/admin/analytics/export?days=${days}&dataset=products`} style={{ height: 34, padding: "8px 12px", border: "1px solid rgba(16,16,16,.25)", color: "inherit", textDecoration: "none" }}>Export products CSV</a>
      <a href={`/admin/analytics/export?days=${days}&dataset=searches`} style={{ height: 34, padding: "8px 12px", border: "1px solid rgba(16,16,16,.25)", color: "inherit", textDecoration: "none" }}>Export searches CSV</a>
      <a href={`/admin/analytics/export?days=${days}&dataset=events`} style={{ height: 34, padding: "8px 12px", border: "1px solid rgba(16,16,16,.25)", color: "inherit", textDecoration: "none" }}>Export events CSV</a>
    </div>
  );
}
