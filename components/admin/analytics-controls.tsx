"use client";

import { useEffect, useState } from "react";

const DISABLED_KEY = "street-analytics-disabled";
const ADMIN_INCLUDE_OVERRIDE_KEY = "street-analytics-admin-include";

function setBrowserExclusion(excluded: boolean) {
  if (excluded) {
    localStorage.setItem(DISABLED_KEY, "true");
    document.cookie = "street_analytics_excluded=true; Path=/; Max-Age=31536000; SameSite=Lax";
  } else {
    localStorage.removeItem(DISABLED_KEY);
    document.cookie = "street_analytics_excluded=; Path=/; Max-Age=0; SameSite=Lax";
  }
}

export function AnalyticsControls({ days }: { days: number }) {
  const [excluded, setExcluded] = useState(true);

  useEffect(() => {
    const explicitlyIncluded = localStorage.getItem(ADMIN_INCLUDE_OVERRIDE_KEY) === "true";
    const nextExcluded = !explicitlyIncluded;
    setBrowserExclusion(nextExcluded);
    setExcluded(nextExcluded);
  }, []);

  function toggleExclusion() {
    const next = !excluded;
    setExcluded(next);
    if (next) localStorage.removeItem(ADMIN_INCLUDE_OVERRIDE_KEY);
    else localStorage.setItem(ADMIN_INCLUDE_OVERRIDE_KEY, "true");
    setBrowserExclusion(next);
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <button type="button" onClick={toggleExclusion} style={{ height: 34, padding: "0 12px", border: "1px solid rgba(16,16,16,.25)", background: excluded ? "#101010" : "#fff", color: excluded ? "#fff" : "#101010", cursor: "pointer" }}>
        {excluded ? "This admin browser is excluded" : "Include this browser"}
      </button>
      <span style={{ fontSize: 11, color: "rgba(16,16,16,.58)" }}>Admin browsers are excluded by default from page views and outbound intent.</span>
      <a href={`/admin/analytics/export?days=${days}&dataset=products`} style={{ height: 34, padding: "8px 12px", border: "1px solid rgba(16,16,16,.25)", color: "inherit", textDecoration: "none" }}>Export products CSV</a>
      <a href={`/admin/analytics/export?days=${days}&dataset=searches`} style={{ height: 34, padding: "8px 12px", border: "1px solid rgba(16,16,16,.25)", color: "inherit", textDecoration: "none" }}>Export searches CSV</a>
      <a href={`/admin/analytics/export?days=${days}&dataset=events`} style={{ height: 34, padding: "8px 12px", border: "1px solid rgba(16,16,16,.25)", color: "inherit", textDecoration: "none" }}>Export events CSV</a>
    </div>
  );
}
